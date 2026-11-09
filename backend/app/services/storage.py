"""Kho audio riêng tư. Audio không bao giờ lên chain và không bao giờ được log.

Hai cách lưu cùng một giao diện (`AudioStorage`), chọn ở container theo cấu hình:
- `PrivateStorage`: thư mục trên đĩa của máy chủ (mặc định, local).
- `B2Storage`: Backblaze B2 — bucket riêng tư, mã hóa phía máy chủ (SSE-B2, AES-256), gọi API gốc của B2 bằng httpx
  (implementation-plan §3 #29). Đường dẫn tương đối (`audio/<campaign>/<uuid>.wav`) giống hệt nhau ở hai cách lưu, nên
  database không phụ thuộc nơi lưu; trên B2 mỗi deployment có tiền tố riêng `<network>-<fingerprint>/`.

Xóa là xóa THẬT (thu hồi đồng thuận / bị loại): trên B2 xóa mọi phiên bản của file, không chỉ "ẩn".
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.errors import ServiceUnavailable


class StorageError(ServiceUnavailable):
    """Lỗi kho lưu trữ — API trả 503 kèm thông điệp tiếng Việt; không bao giờ chứa khóa hay nội dung audio."""

    code = "storage_unavailable"


class AudioStorage(Protocol):
    def save_audio(self, campaign_id: int, data: bytes) -> str: ...
    def read(self, rel: str) -> bytes: ...
    def exists(self, rel: str | None) -> bool: ...
    def delete(self, rel: str | None) -> bool: ...
    def describe(self) -> str: ...


def _new_rel(campaign_id: int) -> str:
    return f"audio/{campaign_id}/{uuid.uuid4().hex}.wav"


def _check_rel(rel: str) -> str:
    if rel.startswith("/") or ".." in rel.split("/") or "\\" in rel:
        raise ValueError("đường dẫn ngoài kho lưu trữ")
    return rel


class PrivateStorage:
    """Lưu trên đĩa của máy chủ (thư mục dữ liệu của deployment)."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        (self.root / "audio").mkdir(parents=True, exist_ok=True)

    def describe(self) -> str:
        return "local"

    def _abs(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if self.root not in p.parents:
            raise ValueError("đường dẫn ngoài kho lưu trữ")
        return p

    def save_audio(self, campaign_id: int, data: bytes) -> str:
        rel = _new_rel(campaign_id)
        p = self._abs(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)
        return rel

    def read(self, rel: str) -> bytes:
        return self._abs(rel).read_bytes()

    def exists(self, rel: str | None) -> bool:
        return bool(rel) and self._abs(rel).exists()

    def delete(self, rel: str | None) -> bool:
        """Xóa thật file audio (dùng khi thu hồi / bị loại)."""
        if not rel:
            return False
        p = self._abs(rel)
        if p.exists():
            p.unlink()
            return True
        return False


class B2Storage:
    """Backblaze B2 qua API gốc (b2api/v2). Chỉ cần keyID + applicationKey + tên bucket; endpoint do B2 trả về."""

    AUTH_URL = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account"

    def __init__(self, key_id: str, application_key: str, bucket: str, prefix: str, client: httpx.Client | None = None):
        self._key_id, self._app_key = key_id, application_key
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self._http = client or httpx.Client(timeout=httpx.Timeout(60.0, connect=15.0))
        self._lock = threading.Lock()
        self._auth: dict | None = None
        self._bucket_id: str | None = None

    def __repr__(self) -> str:  # không bao giờ in khóa
        return f"B2Storage(bucket={self.bucket!r}, prefix={self.prefix!r})"

    NETWORK_TRIES = 3

    def _request(self, method: str, url: str, **kw) -> httpx.Response:
        """Mạng tới B2 chập chờn (timeout, mất kết nối) ⇒ thử lại vài lần rồi mới báo lỗi 503 dễ hiểu."""
        last: Exception | None = None
        for attempt in range(self.NETWORK_TRIES):
            try:
                return self._http.request(method, url, **kw)
            except httpx.TransportError as e:
                last = e
                if attempt + 1 < self.NETWORK_TRIES:
                    time.sleep(0.5 * (attempt + 1))
        raise StorageError(
            f"Không kết nối được kho lưu trữ Backblaze B2 ({type(last).__name__}) — hãy thử lại sau ít phút"
        ) from last

    def describe(self) -> str:
        return f"b2:{self.bucket}/{self.prefix}"

    # ------------------------------------------------------------------ xác thực
    def _authorize(self) -> dict:
        with self._lock:
            r = self._request("GET", self.AUTH_URL, auth=(self._key_id, self._app_key))
            if r.status_code != 200:
                raise StorageError(f"Không xác thực được với Backblaze B2 (HTTP {r.status_code}) — kiểm tra B2_KEY_ID / B2_APPLICATION_KEY")
            auth = r.json()
            allowed = auth.get("allowed") or {}
            if allowed.get("bucketName") and allowed["bucketName"] != self.bucket:
                raise StorageError(f"Application key chỉ được dùng cho bucket {allowed['bucketName']}, không phải {self.bucket}")
            self._auth = auth
            bucket_id = allowed.get("bucketId") if allowed.get("bucketName") == self.bucket else None
            lr = self._request(
                "POST",
                f"{auth['apiUrl']}/b2api/v2/b2_list_buckets",
                headers={"Authorization": auth["authorizationToken"]},
                json={"accountId": auth["accountId"], "bucketName": self.bucket},
            )
            buckets = lr.json().get("buckets") if lr.status_code == 200 else None
            if buckets:
                bucket_id = bucket_id or buckets[0]["bucketId"]
                # Audio là dữ liệu cá nhân: bucket công khai thì ai đoán được tên file cũng tải được.
                if buckets[0].get("bucketType") == "allPublic":
                    raise StorageError(
                        f"Bucket {self.bucket} đang để Public — audio phải nằm trong bucket Private "
                        "(Backblaze → Buckets → Bucket Settings → Files in Bucket are: Private)"
                    )
            if not bucket_id:
                raise StorageError(f"Không tìm thấy bucket {self.bucket} (hoặc key không có quyền listBuckets)")
            self._bucket_id = bucket_id
            return auth

    def _session(self) -> dict:
        return self._auth or self._authorize()

    def check(self) -> None:
        """Gọi lúc khởi động: xác thực + tìm bucket, báo lỗi rõ ràng nếu cấu hình sai."""
        self._authorize()

    def _api(self, name: str, body: dict) -> dict:
        for attempt in range(2):
            auth = self._session()
            r = self._request("POST", f"{auth['apiUrl']}/b2api/v2/{name}", headers={"Authorization": auth["authorizationToken"]}, json=body)
            if r.status_code == 401 and attempt == 0:
                self._auth = None  # token hết hạn (24 giờ) ⇒ xác thực lại
                continue
            if r.status_code != 200:
                raise StorageError(f"B2 {name} lỗi HTTP {r.status_code}")
            return r.json()
        raise StorageError(f"B2 {name} bị từ chối xác thực")

    def _name(self, rel: str) -> str:
        return f"{self.prefix}/{_check_rel(rel)}"

    # ------------------------------------------------------------------ thao tác
    def save_audio(self, campaign_id: int, data: bytes) -> str:
        rel = _new_rel(campaign_id)
        sha1 = hashlib.sha1(data).hexdigest()  # noqa: S324 - B2 yêu cầu SHA-1 để kiểm toàn vẹn khi tải lên
        for attempt in range(2):
            self._session()
            up = self._api("b2_get_upload_url", {"bucketId": self._bucket_id})
            r = self._request(
                "POST",
                up["uploadUrl"],
                content=data,
                headers={
                    "Authorization": up["authorizationToken"],
                    "X-Bz-File-Name": quote(self._name(rel), safe="/"),
                    "Content-Type": "audio/wav",
                    "X-Bz-Content-Sha1": sha1,
                    "X-Bz-Server-Side-Encryption": "AES256",
                },
            )
            if r.status_code == 200:
                return rel
            if attempt == 0 and r.status_code in (401, 408, 429, 500, 503):
                continue  # B2 khuyến nghị lấy upload URL mới rồi thử lại
            raise StorageError(f"Không tải được audio lên B2 (HTTP {r.status_code})")
        raise StorageError("Không tải được audio lên B2")

    def _download(self, rel: str, method: str) -> httpx.Response:
        for attempt in range(2):
            auth = self._session()
            url = f"{auth['downloadUrl']}/file/{quote(self.bucket)}/{quote(self._name(rel), safe='/')}"
            r = self._request(method, url, headers={"Authorization": auth["authorizationToken"]})
            if r.status_code == 401 and attempt == 0:
                self._auth = None
                continue
            return r
        return r

    def read(self, rel: str) -> bytes:
        r = self._download(rel, "GET")
        if r.status_code == 404:
            raise FileNotFoundError(rel)
        if r.status_code != 200:
            raise StorageError(f"Không đọc được audio từ B2 (HTTP {r.status_code})")
        return r.content

    def exists(self, rel: str | None) -> bool:
        if not rel:
            return False
        r = self._download(rel, "HEAD")
        if r.status_code in (200, 404):
            return r.status_code == 200
        raise StorageError(f"Không kiểm tra được audio trên B2 (HTTP {r.status_code})")

    def _delete_versions(self, prefix: str, exact: str | None = None) -> int:
        self._session()
        deleted, start_name, start_id = 0, prefix, None
        while True:
            body: dict = {"bucketId": self._bucket_id, "prefix": prefix, "startFileName": start_name, "maxFileCount": 1000}
            if start_id:
                body["startFileId"] = start_id
            page = self._api("b2_list_file_versions", body)
            for f in page.get("files", []):
                if exact is None or f["fileName"] == exact:
                    self._api("b2_delete_file_version", {"fileName": f["fileName"], "fileId": f["fileId"]})
                    deleted += 1
            start_name, start_id = page.get("nextFileName"), page.get("nextFileId")
            if not start_name or exact is not None:
                return deleted

    def delete(self, rel: str | None) -> bool:
        """Xóa thật: mọi phiên bản của file (B2 giữ phiên bản cũ nếu chỉ "ẩn")."""
        if not rel:
            return False
        name = self._name(rel)
        return self._delete_versions(name, exact=name) > 0

    def delete_prefix(self, prefix: str) -> int:
        """Dùng cho reset dữ liệu local: xóa mọi file dưới `prefix` (vd. "local-")."""
        return self._delete_versions(prefix.lstrip("/"))

// Giải mã lỗi ví / giao dịch (viem, wagmi, ví Core/MetaMask) thành thông báo tiếng Việt.
// Bảng lỗi hợp đồng dùng chung với backend/app/blockchain/errors.py.
import { BaseError, ContractFunctionRevertedError } from "viem";
import { network } from "@/lib/config";

const MESSAGES: Record<string, string> = {
  NotQcOracle: "Chỉ QC oracle được gọi hàm này",
  InvalidParams: "Tham số không hợp lệ",
  NotCollecting: "Chiến dịch đã ngừng thu thập",
  NoConsent: "Chưa ký đồng thuận cho chiến dịch này",
  AlreadyConsented: "Bạn đã đồng thuận trước đó",
  DuplicateCommitment: "Bản ghi trùng",
  AlreadyRevoked: "Bản ghi đã được thu hồi",
  NotContributor: "Bạn không phải người đóng góp bản ghi này",
  BadSignature: "Chữ ký không hợp lệ",
  Expired: "Chữ ký đã hết hạn",
  AlreadyLicensed: "Ví này đã có license cho bộ dữ liệu",
  NothingToSell: "Chưa có bản ghi hợp lệ nào để bán",
  PriceTooHigh: "Giá vừa tăng cao hơn mức bạn chấp nhận — hãy thử lại",
  NotCreator: "Chỉ người tạo chiến dịch được thực hiện",
  TooEarly: "Chưa đến hạn",
  NothingToClaim: "Không có tiền để rút",
  FeeTooHigh: "Phí rút hộ cao hơn mức bạn đã ký",
  ERC20InsufficientBalance: "Số dư không đủ",
  ERC20InsufficientAllowance: "Chưa phê duyệt đủ token",
};

const chainName = network.chain.name;
const symbol = network.chain.nativeCurrency.symbol;

/** Mã lỗi chuẩn của ví (EIP-1193 / EIP-1474) — ví trả về khi từ chối hoặc không xử lý được yêu cầu. */
const WALLET_CODES: Record<number, string> = {
  4001: "Bạn đã từ chối yêu cầu trong ví",
  4100: "Ví từ chối vì trang chưa được phép dùng tài khoản này. Mở MetaMask/Core, mở khóa ví và kiểm tra tài khoản đang kết nối với trang, rồi thử lại.",
  4200: "Ví này không hỗ trợ thao tác được yêu cầu",
  4900: "Ví đang mất kết nối. Mở khóa ví rồi tải lại trang.",
  4901: `Ví chưa kết nối tới mạng ${chainName}. Chọn đúng mạng trong ví rồi thử lại.`,
  4902: `Ví chưa có mạng ${chainName}. Thêm mạng vào ví rồi thử lại.`,
  [-32002]: "Ví đang có một yêu cầu chờ xử lý. Mở MetaMask/Core để xác nhận hoặc từ chối yêu cầu đó trước.",
};

/** Lỗi theo tên lớp (viem/wagmi) không có mã ví riêng. */
const NAMED: Record<string, string> = {
  ConnectorNotConnectedError: "Ví chưa kết nối. Bấm Kết nối ví rồi thử lại.",
  ConnectorAccountNotFoundError: "Tài khoản đang chọn trong ví không còn kết nối với trang này. Mở ví, kết nối lại tài khoản rồi thử lại.",
  ConnectorChainMismatchError: `Ví đang ở mạng khác. Chuyển sang ${chainName} rồi thử lại.`,
  ConnectorUnavailableReconnectingError: "Ví đang kết nối lại. Đợi vài giây rồi thử lại.",
  ProviderNotFoundError: "Chưa có ví trên trình duyệt. Cài Core hoặc MetaMask rồi tải lại trang.",
  SwitchChainNotSupportedError: `Ví không tự đổi mạng được. Hãy chọn ${chainName} trong ví.`,
  InsufficientFundsError: `Ví không đủ ${symbol} để trả phí mạng`,
  NonceTooHighError: "Số thứ tự giao dịch (nonce) trong ví lệch với chain. Trong MetaMask: Cài đặt → Nâng cao → Xóa dữ liệu thẻ hoạt động, rồi thử lại.",
  NonceTooLowError: "Số thứ tự giao dịch (nonce) trong ví lệch với chain. Trong MetaMask: Cài đặt → Nâng cao → Xóa dữ liệu thẻ hoạt động, rồi thử lại.",
  HttpRequestError: "Không gọi được nút mạng blockchain (RPC). Kiểm tra kết nối rồi thử lại.",
  TimeoutError: "Mạng blockchain phản hồi quá lâu. Thử lại sau ít phút.",
};

/** Duyệt chuỗi `cause` (lỗi viem, wagmi, hoặc lỗi thô {code, message} của ví) để tìm lỗi đã biết. */
function knownError(err: unknown): string | null {
  let e: unknown = err;
  for (let depth = 0; e && typeof e === "object" && depth < 10; depth++) {
    const { code, name, cause } = e as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof code === "number" && WALLET_CODES[code]) return WALLET_CODES[code];
    if (typeof name === "string" && NAMED[name]) return NAMED[name];
    e = cause;
  }
  return null;
}

/** Lỗi do thư viện ví (viem/wagmi) ném ra — thông điệp gốc là tiếng Anh nhiều dòng. */
function isWalletLibraryError(err: unknown): boolean {
  return err instanceof BaseError || (err instanceof Error && typeof (err as { shortMessage?: unknown }).shortMessage === "string");
}

/**
 * Thông báo tiếng Việt cho mọi lỗi ở luồng ví/giao dịch. Lỗi của máy chủ (ApiError) và lỗi tự ném trong app
 * vốn đã là tiếng Việt nên giữ nguyên dòng đầu.
 */
export function describeChainError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "";
      return MESSAGES[name] ?? (reverted.reason ? `Hợp đồng từ chối giao dịch: ${reverted.reason}` : "Hợp đồng từ chối giao dịch");
    }
  }
  const known = knownError(err);
  if (known) return known;
  if (isWalletLibraryError(err)) {
    console.warn("[ví] lỗi chưa có bản dịch:", err);
    return "Ví hoặc mạng báo lỗi chưa rõ nguyên nhân. Thử lại; nếu vẫn lỗi, tải lại trang.";
  }
  if (err instanceof Error) return err.message.split("\n")[0];
  return "Đã có lỗi xảy ra";
}

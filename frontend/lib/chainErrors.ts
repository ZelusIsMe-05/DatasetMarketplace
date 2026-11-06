// Giải mã lỗi giao dịch (viem) thành thông báo tiếng Việt — cùng bảng với backend/app/blockchain/errors.py.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

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

export function describeChainError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Bạn đã từ chối yêu cầu trong ví";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "";
      return MESSAGES[name] ?? reverted.shortMessage;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Đã có lỗi xảy ra";
}

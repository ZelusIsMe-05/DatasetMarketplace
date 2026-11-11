// Ví người mua / người tạo: Core hoặc MetaMask (injected) qua wagmi.
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { network, RPC_URL } from "@/lib/config";

export const wagmiConfig = createConfig({
  chains: [network.chain],
  connectors: [injected()],
  transports: { [network.chain.id]: http(RPC_URL) },
  ssr: true,
  // Chỉ MỘT connector cho ví trên window.ethereum (ứng dụng cũng gọi thẳng window.ethereum để chọn tài khoản).
  // Bật EIP-6963 thì MetaMask có thêm connector "io.metamask" cùng provider: nó bắt accountsChanged, chiếm kết nối
  // hiện tại, và đăng xuất (disconnect) chỉ gỡ một trong hai — wagmi vẫn báo "đã kết nối" trong khi MetaMask đã thu
  // quyền của trang, lần đăng nhập sau ký bị từ chối cho tới khi F5.
  multiInjectedProviderDiscovery: false,
});

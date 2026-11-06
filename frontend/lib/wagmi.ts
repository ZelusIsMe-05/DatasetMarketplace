// Ví người mua / người tạo: Core hoặc MetaMask (injected) qua wagmi.
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { network, RPC_URL } from "@/lib/config";

export const wagmiConfig = createConfig({
  chains: [network.chain],
  connectors: [injected()],
  transports: { [network.chain.id]: http(RPC_URL) },
  ssr: true,
});

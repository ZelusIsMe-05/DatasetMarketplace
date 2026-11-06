"use client";

// React Query trên các endpoint thật của backend. Khóa query thống nhất để invalidate sau giao dịch.
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/services/api";

export const qk = {
  health: ["health"] as const,
  fx: ["fx"] as const,
  campaigns: ["campaigns"] as const,
  campaign: (id: number) => ["campaign", id] as const,
  price: (id: number) => ["price", id] as const,
  terms: (id: number) => ["terms", id] as const,
  revenue: (id: number) => ["revenue", id] as const,
  license: (id: number, addr?: string) => ["license", id, addr?.toLowerCase()] as const,
  mine: (addr?: string) => ["me", "contributions", addr?.toLowerCase()] as const,
  consent: (id: number, addr?: string) => ["consent", id, addr?.toLowerCase()] as const,
};

export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: publicApi.health, staleTime: 30_000 });
export const useFx = () => useQuery({ queryKey: qk.fx, queryFn: publicApi.fx, staleTime: 60_000 });
export const useCampaigns = () => useQuery({ queryKey: qk.campaigns, queryFn: publicApi.campaigns, refetchInterval: 15_000 });
export const useCampaign = (id: number) => useQuery({ queryKey: qk.campaign(id), queryFn: () => publicApi.campaign(id), refetchInterval: 15_000 });
export const usePrice = (id: number) => useQuery({ queryKey: qk.price(id), queryFn: () => publicApi.price(id), refetchInterval: 10_000 });
export const useTerms = (id: number, enabled = true) => useQuery({ queryKey: qk.terms(id), queryFn: () => publicApi.terms(id), enabled });
export const useRevenue = (id: number, enabled = true) => useQuery({ queryKey: qk.revenue(id), queryFn: () => publicApi.revenue(id), enabled });
export const useLicense = (id: number, address?: string) =>
  useQuery({ queryKey: qk.license(id, address), queryFn: () => publicApi.license(id, address!), enabled: Boolean(address) });

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = { name: string; details: string };

export function useSettings() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data
        ? { ...data, payment_methods: (data.payment_methods as unknown as PaymentMethod[]) ?? [] }
        : null;
    },
    staleTime: 60_000,
  });
}

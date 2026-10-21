import { QueryClient } from "@tanstack/react-query";

// Cache only in the router's own client: never share private data across SSR requests.
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}
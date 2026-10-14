import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

export function useRouteQuery(key = "q") {
  const route = useRoute();
  const router = useRouter();
  return computed({
    get: () => (typeof route.query[key] === "string" ? route.query[key] : ""),
    set: (value: string) => {
      const normalized = value.trimStart();
      const query = { ...route.query, [key]: normalized || undefined };
      void router.replace({ query });
    },
  });
}

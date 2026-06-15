import type { DistributionStore, Store } from "@kittie/types";
import type { ComponentType, SVGProps } from "react";
import { IconApple, IconDatabase, IconGlobe, IconGooglePlay } from "../icons";

type StoreIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface DistributionStoreDisplay {
  label: string;
  color: string;
  Icon: StoreIcon;
  mobile: boolean;
}

export function isMobileStore(store: string): store is Store {
  return store === "apple" || store === "google";
}

export function storeDisplay(store: DistributionStore | string): DistributionStoreDisplay {
  switch (store) {
    case "apple":
      return { label: "App Store", color: "#c8c8d0", Icon: IconApple, mobile: true };
    case "google":
      return { label: "Google Play", color: "#34d399", Icon: IconGooglePlay, mobile: true };
    case "steam":
      return { label: "Steam", color: "#66c0f4", Icon: IconDatabase, mobile: false };
    case "itch":
      return { label: "itch.io", color: "#fa5c5c", Icon: IconGlobe, mobile: false };
    default:
      return { label: "Unknown store", color: "#8a8a92", Icon: IconGlobe, mobile: false };
  }
}

export function StoreGlyph({
  store,
  ...props
}: { store: DistributionStore | string } & SVGProps<SVGSVGElement>) {
  const Icon = storeDisplay(store).Icon;
  return <Icon {...props} />;
}

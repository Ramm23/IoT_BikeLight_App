// geocoder-augment.d.ts
import type * as L from "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.esm.js";

declare module "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.esm.js" {
  namespace Control {
    /**
     * Adds the geocoder control.
     * @param options plugin-specific options
     */
    function geocoder(options?: any): L.Control;
  }
}

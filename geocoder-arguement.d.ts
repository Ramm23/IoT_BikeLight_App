// geocoder-augment.d.ts
import type * as L from 'https://esm.sh/leaflet@1.9.4';

declare module 'https://esm.sh/leaflet@1.9.4' {
  namespace Control {
    /**
     * Adds the geocoder control.
     * @param options plugin-specific options
     */
    function geocoder(options?: any): L.Control;
  }
}

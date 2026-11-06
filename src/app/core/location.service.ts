import { Injectable } from '@angular/core';

export interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  /** Resolves with coordinates, or null if the browser can't / the user won't share them. */
  getPosition(): Promise<Coords | null> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }
}

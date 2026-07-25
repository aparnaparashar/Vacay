"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

interface TripData {
  id: number | null;
  origin: string;
  destination: string;
  departureDate: string;
  arrivalDate: string;
  adults: number;
  budget: number;
  weather: any;
  flights: any[];
  hotels: any[];
  itinerary: any;
  packing: any;
  budgetResult: any;
  participants: any[];
  expenses: any[];
  mapMarkers: any[];
  mapCenter: { lat: number; lng: number };
}

interface TripContextType {
  tripData: TripData;
  setTripData: (data: Partial<TripData>) => void;
}

const defaultTrip: TripData = {
  id: null,
  origin: "",
  destination: "",
  departureDate: "",
  arrivalDate: "",
  adults: 1,
  budget: 50000,
  weather: null,
  flights: [],
  hotels: [],
  itinerary: null,
  packing: null,
  budgetResult: null,
  participants: [],
  expenses: [],
  mapMarkers: [],
  mapCenter: { lat: 19.076, lng: 72.8777 },
};

const TripContext = createContext<TripContextType>({
  tripData: defaultTrip,
  setTripData: () => {},
});

export function TripProvider({ children }: { children: ReactNode }) {
  const [tripData, setTripDataState] = useState<TripData>(defaultTrip);

  const setTripData = useCallback((data: Partial<TripData>) => {
    setTripDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const value = useMemo(
    () => ({
      tripData,
      setTripData,
    }),
    [tripData, setTripData],
  );

  return (
    <TripContext.Provider value={value}>
      {children}
    </TripContext.Provider>
  );
}

export function useTripData() {
  return useContext(TripContext);
}

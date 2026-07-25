"use client";

import { useTripData } from "@/context/TripContext";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

export default function HotelsPage() {
  const { tripData } = useTripData();
  const hotels = tripData.hotels || [];
  const [selectedHotel, setSelectedHotel] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<"price-asc" | "price-desc" | "rating-desc">("price-asc");
  const [favorites, setFavorites] = useState<number[]>([]);

  const visibleHotels = useMemo(() => {
    const parsePrice = (price: any) => {
      if (typeof price === "number") return price;
      const normalized = String(price ?? "")
        .replace(/,/g, "")
        .replace(/[^0-9.]/g, "");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };

    const parseRating = (rating: any) => {
      const parsed = Number(rating);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const current = [...hotels];
    current.sort((left: any, right: any) => {
      if (sortMode === "rating-desc") {
        return parseRating(right.rating) - parseRating(left.rating);
      }

      const leftPrice = parsePrice(left.price);
      const rightPrice = parsePrice(right.price);
      return sortMode === "price-asc"
        ? leftPrice - rightPrice
        : rightPrice - leftPrice;
    });
    return current;
  }, [hotels, sortMode]);

  const toggleFavorite = (index: number) => {
    setFavorites((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
    );
  };

  const openHotelDetails = (hotel: any) => {
    const url =
      hotel.website ||
      hotel.maps_uri ||
      `https://www.google.com/travel/hotels?q=${encodeURIComponent(hotel.name || tripData.destination || "hotel")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openMapSearch = () => {
    const destination = tripData.destination || "hotel";
    window.open(
      `https://www.google.com/maps/search/${encodeURIComponent(destination)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  if (hotels.length === 0) {
    return (
      <div className="max-w-6xl mx-auto w-full animate-fade-in">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-24 h-24 rounded-full bg-primary-fixed/30 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-5xl">
              hotel
            </span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            No Hotels Found
          </h2>
          <p className="text-on-surface-variant max-w-md">
            Generate a trip first from the home page. Once your trip is planned,
            available hotels will appear here.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm transition-transform active:scale-95 hover:opacity-90"
          >
            <span className="material-symbols-outlined text-sm">explore</span>
            Plan a Trip
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8 animate-fade-in pt-[136px] px-8 pb-12">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">Hotels</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            {tripData.destination || "Destination"} •{" "}
            {hotels.length} propert{hotels.length !== 1 ? "ies" : "y"} found
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-2"
            onClick={() =>
              setSortMode((current) =>
                current === "price-asc"
                  ? "price-desc"
                  : current === "price-desc"
                    ? "rating-desc"
                    : "price-asc",
              )
            }
          >
            <span className="material-symbols-outlined text-sm">sort</span>
            {sortMode === "price-asc"
              ? "Sort: Price ↑"
              : sortMode === "price-desc"
                ? "Sort: Price ↓"
                : "Sort: Rating"}
          </button>
          <button 
            className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-2"
            onClick={() => setFavorites((current) => (current.length ? [] : visibleHotels.map((_, index) => index)))}
          >
            <span className="material-symbols-outlined text-sm">
              filter_list
            </span>
            {favorites.length ? "Show All" : "Favorites"}
          </button>
        </div>
      </div>

      {/* Hotels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleHotels
          .filter((hotel: any, index: number) =>
            favorites.length ? favorites.includes(index) : true,
          )
          .map((hotel: any, index: number) => {
          const isSelected = selectedHotel === index;
          const rating =
            typeof hotel.rating === "string"
              ? parseFloat(hotel.rating)
              : hotel.rating || 0;
          const amenities = hotel.amenities || [];

          return (
            <div
              key={index}
              className={`animate-slide-up bg-surface-container-lowest rounded-[24px] border overflow-hidden shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group ${
                isSelected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-outline-variant/50"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Thumbnail */}
              <div className="relative h-48 overflow-hidden bg-surface-container-high">
                {hotel.thumbnail ? (
                  <img
                    src={hotel.thumbnail}
                    alt={hotel.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container">
                    <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">
                      apartment
                    </span>
                  </div>
                )}
                {/* Rating Badge */}
                {rating > 0 && (
                  <div className="absolute top-3 right-3 bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md border border-outline-variant/30">
                    <span
                      className="material-symbols-outlined text-sm text-amber-500"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                    <span className="text-sm font-bold text-on-surface">
                      {rating.toFixed(1)}
                    </span>
                  </div>
                )}
                {/* Favorite Button */}
                <button
                  className="absolute top-3 left-3 w-9 h-9 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center border border-outline-variant/30 shadow-md transition-all hover:scale-110 active:scale-95"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(index);
                  }}
                >
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                    {favorites.includes(index) ? "favorite" : "favorite_border"}
                  </span>
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-on-surface leading-tight mb-1">
                    {hotel.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">
                      location_on
                    </span>
                    <span className="text-xs">
                      {tripData.destination || "Destination"}
                    </span>
                  </div>
                </div>

                {/* Amenities */}
                {amenities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {amenities.slice(0, 5).map((amenity: string, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full border border-outline-variant/30"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          {getAmenityIcon(amenity)}
                        </span>
                        {amenity}
                      </span>
                    ))}
                    {amenities.length > 5 && (
                      <span className="text-[11px] font-medium text-primary bg-primary-fixed/30 px-2.5 py-1 rounded-full">
                        +{amenities.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-outline-variant/30" />

                {/* Price & Action */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-on-surface">
                      {hotel.price}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      per night
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSelectedHotel(isSelected ? null : index)
                    }
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${
                      isSelected
                        ? "bg-primary text-on-primary"
                        : "border-2 border-primary text-primary hover:bg-primary-fixed/30"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {isSelected ? "check_circle" : "add_circle_outline"}
                    </span>
                    {isSelected ? "Selected" : "Select Hotel"}
                  </button>
                </div>
                
                {/* View Details mock button */}
                <button 
                  className="w-full mt-4 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-bold shadow-sm hover:opacity-90 transition-all active:scale-95"
                  onClick={(e) => {
                    e.stopPropagation();
                    openHotelDetails(hotel);
                  }}
                >
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Footer */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/50 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-container p-2 bg-primary-fixed rounded-lg">
            info
          </span>
          <p className="text-sm text-on-surface-variant">
            Prices are per night and may vary based on availability and season.
          </p>
        </div>
        <button
          className="text-xs font-bold text-primary hover:underline"
          onClick={openMapSearch}
        >
          View on map
        </button>
      </div>
    </div>
  );
}

/** Maps common amenity keywords to Material Symbols icon names */
function getAmenityIcon(amenity: string): string {
  const lower = amenity.toLowerCase();
  if (lower.includes("wifi") || lower.includes("internet")) return "wifi";
  if (lower.includes("pool") || lower.includes("swim")) return "pool";
  if (lower.includes("spa")) return "spa";
  if (lower.includes("gym") || lower.includes("fitness")) return "fitness_center";
  if (lower.includes("parking")) return "local_parking";
  if (lower.includes("breakfast") || lower.includes("restaurant") || lower.includes("food"))
    return "restaurant";
  if (lower.includes("ac") || lower.includes("air")) return "ac_unit";
  if (lower.includes("laundry")) return "local_laundry_service";
  if (lower.includes("bar") || lower.includes("lounge")) return "local_bar";
  if (lower.includes("pet")) return "pets";
  return "check_circle";
}

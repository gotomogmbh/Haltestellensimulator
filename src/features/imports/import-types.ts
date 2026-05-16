import type { ImportType } from "@/types/domain";

export const IMPORT_TYPE_OPTIONS: ReadonlyArray<{
  value: ImportType;
  label: string;
}> = [
  { value: "HARDWARE_INVENTORY", label: "Hardware-Inventar (VBZ-Excel)" },
  { value: "GTFS_STATIC", label: "GTFS Static (ZIP von opentransportdata.swiss)" },
  { value: "POI_EVENT_LOCATIONS", label: "POI / Event-Locations" },
  { value: "PASSENGER_COUNTS", label: "Passagierzahlen" },
  { value: "MANUAL_SITE_ATTRIBUTES", label: "Manuelle Site-Attribute" },
  { value: "OTHER", label: "Sonstige" },
];

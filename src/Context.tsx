import * as Location from 'expo-location';
import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

// --- Types, Interfaces, Enums ---
export interface GeofenceRegion {
    id: string;
    latitude: number;
    longitude: number;
    radius: number;
    notificationMessage?: string;
}
export type GeofenceEventType = 'enter' | 'exit' | 'dwell';
export interface GeofenceEvent {
    region: GeofenceRegion;
    eventType: GeofenceEventType;
    location: Location.LocationObject;
    timestamp: number;
}
export interface LocationConfig {
    accuracy?: Location.Accuracy;
    maxCacheAge?: number;
    distanceInterval?: number;
    timeInterval?: number;
    foregroundService?: boolean;
    deferredUpdatesInterval?: number;
}
export interface LocationAddress {
    city?: string;
    country?: string;
    region?: string;
    street?: string;
    postalCode?: string;
    timezone?: string;
    name?: string;
}
export interface LocationData {
    granted: boolean;
    location: Location.LocationObject | null;
    accuracy?: number;
    timestamp?: number;
    fromCache?: boolean;
    address?: LocationAddress;
}
export enum LocationErrorType {
    PERMISSION_DENIED = 'permission_denied',
    POSITION_UNAVAILABLE = 'position_unavailable',
    TIMEOUT = 'timeout',
    NETWORK_ERROR = 'network_error',
    UNKNOWN = 'unknown',
    SETTINGS_ERROR = 'settings_error'
}
export interface LocationError {
    type: LocationErrorType;
    message: string;
    code?: string;
    details?: any;
}
export interface LocationContextType {
    // State
    location: Location.LocationObject | null;
    address: LocationAddress | null;
    error: LocationError | null;
    lastUpdated: number | null;
    hasPermission: boolean;
    isWatching: boolean;
    config: LocationConfig;
    geofences: GeofenceRegion[];
    geofenceEvents: GeofenceEvent[];
    warnings: string[];
    suggestions: string[];

    // Methods
    requestPermission: () => Promise<boolean>;
    getCurrentLocation: (options?: Partial<LocationConfig>) => Promise<LocationData>;
    startWatching: (options?: Partial<LocationConfig>) => Promise<void>;
    stopWatching: () => void;
    updateConfig: (newConfig: Partial<LocationConfig>) => void;
    registerGeofences: (regions: GeofenceRegion[]) => void;
    unregisterGeofences: () => void;
    clearGeofenceEvents: () => void;
    openLocationSettings: () => Promise<void>;

    // Feature Information
    getFeatureRequirements: (feature: string) => string[];
    getFeatureStatus: (feature: string) => boolean;
    getFeatureGuide: (feature: string) => string;
    getPlatformRequirements: (feature: string) => string[];
}

const DEFAULT_CONFIG: LocationConfig = {
    accuracy: Location.Accuracy.Balanced,
    maxCacheAge: 5 * 60 * 1000,
    distanceInterval: 100,
    timeInterval: 5000
};

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// --- Helper Functions ---
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        0.5 - Math.cos(dLat) / 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function isExpoGo(): boolean {
    return typeof (global as any).Expo !== 'undefined' &&
        (global as any).Expo.Constants?.appOwnership === 'expo';
}

// --- LocationProvider ---
interface LocationProviderProps {
    children: ReactNode;
    config?: Partial<LocationConfig>;
    onGeofenceEvent?: (event: GeofenceEvent) => void;
    onLocationUpdate?: (location: Location.LocationObject) => void;
    onError?: (error: LocationError) => void;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({
    children,
    config: initialConfig = {},
    onGeofenceEvent,
    onLocationUpdate,
    onError
}) => {
    // State
    const [config, setConfig] = useState<LocationConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [address, setAddress] = useState<LocationAddress | null>(null);
    const [error, setError] = useState<LocationError | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [hasPermission, setHasPermission] = useState(false);
    const [isWatching, setIsWatching] = useState(false);
    const [geofences, setGeofences] = useState<GeofenceRegion[]>([]);
    const [geofenceEvents, setGeofenceEvents] = useState<GeofenceEvent[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // Refs
    const lastGeofenceStates = useRef<Record<string, boolean>>({});
    const appState = useRef(AppState.currentState);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const retryTimeoutRef = useRef<number | null>(null);
    const lastLocationRef = useRef<Location.LocationObject | null>(null);
    const lastAddressRef = useRef<LocationAddress | null>(null);
    const isMountedRef = useRef(true);
    const geofenceDwellTimers = useRef<Record<string, number>>({});

    // Feature requirements and guides
    const featureRequirements: Record<string, string[]> = {
        mapView: [
            'Requires dev build (not Expo Go)',
            'expo-maps or react-native-maps must be installed',
            'Location permissions must be granted',
            'NSLocationWhenInUseUsageDescription must be set in app.json (iOS)',
            'Google Maps API key must be set in app.json (Android)'
        ],
        geofencing: [
            'Location permissions must be granted',
            'Background location permission recommended for best results',
            'expo-location must be installed',
            'NSLocationAlwaysAndWhenInUseUsageDescription must be set in app.json (iOS)'
        ],
        backgroundLocation: [
            'Background location permission must be granted',
            'expo-location must be installed',
            'UIBackgroundModes with location must be set in app.json (iOS)',
            'Background location permission in AndroidManifest.xml (Android)'
        ],
        highAccuracy: [
            'May consume more battery',
            'GPS hardware required for best results'
        ]
    };

    const platformRequirements: Record<string, string[]> = {
        ios: [
            'NSLocationWhenInUseUsageDescription in app.json',
            'NSLocationAlwaysAndWhenInUseUsageDescription for background location'
        ],
        android: [
            'ACCESS_COARSE_LOCATION or ACCESS_FINE_LOCATION permission',
            'Google Maps API key for map features'
        ]
    };

    const featureGuides: Record<string, string> = {
        mapView: 'MapView requires a dev build (not Expo Go). Install expo-maps or react-native-maps, set location permissions in app.json, and add a Google Maps API key for Android. See Expo docs for details.',
        geofencing: 'Geofencing works best with background location permission. Make sure to request permissions and handle events in your app.',
        backgroundLocation: 'Background location requires special permissions and configuration. Check Expo documentation for setup instructions.',
        highAccuracy: 'High accuracy mode uses more battery but provides better location results. Use judiciously.'
    };

    // Environment detection
    const getFeatureStatus = useCallback((feature: string): boolean => {
        switch (feature) {
            case 'mapView':
                return !isExpoGo();
            case 'geofencing':
                return true;
            case 'backgroundLocation':
                return Platform.OS === 'ios' ? parseInt(Platform.Version as string, 10) >= 14 : true;
            default:
                return true;
        }
    }, []);

    const getFeatureRequirements = useCallback((feature: string): string[] => {
        return featureRequirements[feature] || [];
    }, []);

    const getPlatformRequirements = useCallback((feature: string): string[] => {
        return platformRequirements[Platform.OS] || [];
    }, []);

    const getFeatureGuide = useCallback((feature: string): string => {
        return featureGuides[feature] || '';
    }, []);

    // Error handling
    const handleError = useCallback((error: any, type: LocationErrorType = LocationErrorType.UNKNOWN) => {
        const locationError: LocationError = {
            type,
            message: error?.message || 'An unknown error occurred',
            code: error?.code,
            details: error
        };

        setError(locationError);
        onError?.(locationError);
    }, [onError]);

    // Warnings and suggestions
    useEffect(() => {
        const newWarnings: string[] = [];
        const newSuggestions: string[] = [];

        // Expo Go limitations
        if (isExpoGo()) {
            newWarnings.push('MapView is not available in Expo Go. Use a dev build for map features.');
            newSuggestions.push('Run `npx expo run:ios` or `npx expo run:android` to create a dev build.');
        }

        // Permission warnings
        if (!hasPermission) {
            newWarnings.push('Location permission not granted. Some features may not work.');
            newSuggestions.push('Request location permission before using location features.');
        }

        // Platform-specific suggestions
        if (Platform.OS === 'ios') {
            newSuggestions.push('For background location, add UIBackgroundModes with "location" to your app.json');
        } else {
            newSuggestions.push('For Android, make sure to request background location permissions');
        }

        setWarnings(newWarnings);
        setSuggestions(newSuggestions);
    }, [hasPermission]);

    // Permission handling
    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isMountedRef.current) return false;

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            const granted = status === 'granted';

            setHasPermission(granted);

            if (!granted) {
                handleError(new Error('Location permission was denied'), LocationErrorType.PERMISSION_DENIED);
            } else {
                setError(null);
            }

            return granted;
        } catch (error) {
            handleError(error, LocationErrorType.PERMISSION_DENIED);
            return false;
        }
    }, [handleError]);

    const openLocationSettings = useCallback(async (): Promise<void> => {
        try {
            await Location.enableNetworkProviderAsync();
        } catch (error) {
            handleError(error, LocationErrorType.SETTINGS_ERROR);
        }
    }, [handleError]);

    // Location methods
    const getCurrentLocation = useCallback(async (options: Partial<LocationConfig> = {}): Promise<LocationData> => {
        if (!isMountedRef.current) return { granted: false, location: null };

        const mergedOptions = { ...config, ...options };

        // Check cache first
        if (lastLocationRef.current && lastUpdated && lastAddressRef.current) {
            const cacheAge = Date.now() - lastUpdated;
            if (cacheAge < mergedOptions.maxCacheAge!) {
                return {
                    granted: true,
                    location: lastLocationRef.current,
                    address: lastAddressRef.current,
                    timestamp: lastUpdated,
                    fromCache: true
                };
            }
        }

        if (!hasPermission) {
            const granted = await requestPermission();
            if (!granted) return { granted: false, location: null };
        }

        setError(null);

        try {
            const currentLocation = await Location.getCurrentPositionAsync({
                accuracy: mergedOptions.accuracy!
            });

            let address: LocationAddress | undefined;

            try {
                const geo = await Location.reverseGeocodeAsync(currentLocation.coords);
                if (geo && geo.length > 0) {
                    const g = geo[0];
                    address = {
                        city: g.city ?? undefined,
                        country: g.country ?? undefined,
                        region: g.region ?? undefined,
                        street: g.street ?? undefined,
                        postalCode: g.postalCode ?? undefined,
                        timezone: g.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                        name: g.name ?? undefined
                    };
                }
            } catch (err) {
                // Ignore geocode errors
            }

            if (isMountedRef.current) {
                setLocation(currentLocation);
                setAddress(address || null);
                setLastUpdated(Date.now());
                lastLocationRef.current = currentLocation;
                lastAddressRef.current = address || null;
            }

            return {
                granted: true,
                location: currentLocation,
                address,
                accuracy: currentLocation.coords.accuracy ?? undefined,
                timestamp: Date.now(),
                fromCache: false
            };
        } catch (error) {
            handleError(error, LocationErrorType.POSITION_UNAVAILABLE);
            return { granted: true, location: null };
        }
    }, [config, hasPermission, lastUpdated, requestPermission, handleError]);

    // Geofencing methods
    const checkGeofences = useCallback((loc: Location.LocationObject) => {
        if (!geofences.length) return;

        const events: GeofenceEvent[] = [];

        geofences.forEach((region: GeofenceRegion) => {
            const { latitude, longitude, radius, id } = region;
            const distance = getDistance(
                latitude,
                longitude,
                loc.coords.latitude,
                loc.coords.longitude
            );

            const wasInside = !!lastGeofenceStates.current[id];
            const isInside = distance <= radius;

            if (!wasInside && isInside) {
                // Enter event
                const event = {
                    region,
                    eventType: 'enter' as GeofenceEventType,
                    location: loc,
                    timestamp: Date.now()
                };
                events.push(event);
                onGeofenceEvent?.(event);

                // Set up dwell timer
                if (geofenceDwellTimers.current[id]) {
                    clearTimeout(geofenceDwellTimers.current[id]);
                }

                geofenceDwellTimers.current[id] = setTimeout(() => {
                    const dwellEvent = {
                        region,
                        eventType: 'dwell' as GeofenceEventType,
                        location: loc,
                        timestamp: Date.now()
                    };
                    setGeofenceEvents(prev => [...prev, dwellEvent]);
                    onGeofenceEvent?.(dwellEvent);
                }, 10000) as unknown as number; // 10 seconds dwell time
            } else if (wasInside && !isInside) {
                // Exit event
                const event = {
                    region,
                    eventType: 'exit' as GeofenceEventType,
                    location: loc,
                    timestamp: Date.now()
                };
                events.push(event);
                onGeofenceEvent?.(event);

                // Clear dwell timer
                if (geofenceDwellTimers.current[id]) {
                    clearTimeout(geofenceDwellTimers.current[id]);
                    delete geofenceDwellTimers.current[id];
                }
            }

            lastGeofenceStates.current[id] = isInside;
        });

        if (events.length) {
            setGeofenceEvents(prev => [...prev, ...events]);
        }
    }, [geofences, onGeofenceEvent]);

    const registerGeofences = useCallback((regions: GeofenceRegion[]) => {
        setGeofences(regions);
        lastGeofenceStates.current = {};
        setGeofenceEvents([]);
    }, []);

    const unregisterGeofences = useCallback(() => {
        setGeofences([]);
        lastGeofenceStates.current = {};

        // Clear all dwell timers
        Object.values(geofenceDwellTimers.current).forEach(timer => {
            clearTimeout(timer);
        });
        geofenceDwellTimers.current = {};

        setGeofenceEvents([]);
    }, []);

    const clearGeofenceEvents = useCallback(() => {
        setGeofenceEvents([]);
    }, []);

    // Watch location methods
    const startWatching = useCallback(async (options: Partial<LocationConfig> = {}): Promise<void> => {
        if (!isMountedRef.current || isWatching) return;

        const mergedOptions = { ...config, ...options };

        if (!hasPermission) {
            const granted = await requestPermission();
            if (!granted) return;
        }

        if (locationSubscription.current) {
            locationSubscription.current.remove();
        }

        try {
            setIsWatching(true);
            setError(null);

            locationSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: mergedOptions.accuracy!,
                    distanceInterval: mergedOptions.distanceInterval,
                    timeInterval: mergedOptions.timeInterval
                },
                (newLocation: Location.LocationObject) => {
                    if (!isMountedRef.current) return;

                    setLocation(newLocation);
                    setLastUpdated(Date.now());
                    lastLocationRef.current = newLocation;

                    checkGeofences(newLocation);
                    onLocationUpdate?.(newLocation);
                }
            );
        } catch (error) {
            handleError(error, LocationErrorType.POSITION_UNAVAILABLE);
            setIsWatching(false);
        }
    }, [config, hasPermission, isWatching, requestPermission, handleError, checkGeofences, onLocationUpdate]);

    const stopWatching = useCallback((): void => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        setIsWatching(false);
    }, []);

    const updateConfig = useCallback((newConfig: Partial<LocationConfig>) => {
        setConfig(prev => ({ ...prev, ...newConfig }));

        if (isWatching) {
            stopWatching();
            startWatching(newConfig);
        }
    }, [isWatching, stopWatching, startWatching]);

    // App state handling
    const handleAppStateChange = useCallback((nextAppState: AppStateStatus): void => {
        if (!isMountedRef.current) return;

        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            // App came to foreground
            if (hasPermission && !isWatching) {
                startWatching();
            }
        } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            // App went to background
            stopWatching();
        }

        appState.current = nextAppState;
    }, [hasPermission, isWatching, startWatching, stopWatching]);

    // Initialization and cleanup
    useEffect(() => {
        isMountedRef.current = true;

        const initializeLocation = async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                const permissionGranted = status === 'granted';

                setHasPermission(permissionGranted);

                if (permissionGranted) {
                    await getCurrentLocation();
                    await startWatching();
                }
            } catch (error) {
                handleError(error, LocationErrorType.PERMISSION_DENIED);
            }
        };

        initializeLocation();

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            isMountedRef.current = false;
            stopWatching();
            appStateSubscription.remove();

            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }

            // Clear all geofence timers
            Object.values(geofenceDwellTimers.current).forEach(timer => {
                clearTimeout(timer);
            });
        };
    }, []);

    // Context value
    const contextValue = useMemo((): LocationContextType => ({
        location,
        address,
        error,
        lastUpdated,
        hasPermission,
        isWatching,
        config,
        geofences,
        geofenceEvents,
        warnings,
        suggestions,
        requestPermission,
        getCurrentLocation,
        startWatching,
        stopWatching,
        updateConfig,
        registerGeofences,
        unregisterGeofences,
        clearGeofenceEvents,
        openLocationSettings,
        getFeatureRequirements,
        getFeatureStatus,
        getFeatureGuide,
        getPlatformRequirements
    }), [
        location,
        address,
        error,
        lastUpdated,
        hasPermission,
        isWatching,
        config,
        geofences,
        geofenceEvents,
        warnings,
        suggestions
    ]);

    return (
        <LocationContext.Provider value={contextValue}>
            {children}
        </LocationContext.Provider>
    );
};

// --- Hooks ---
export const useLocation = (): LocationContextType => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
};

export const useCurrentLocation = (options?: Partial<LocationConfig>) => {
    const { getCurrentLocation, error } = useLocation();
    const fetchLocation = useCallback(async () => {
        return await getCurrentLocation(options);
    }, [getCurrentLocation, options]);
    return { fetchLocation, error };
};

export const useGeofencing = () => {
    const {
        geofences,
        registerGeofences,
        unregisterGeofences,
        geofenceEvents,
        clearGeofenceEvents
    } = useLocation();

    return {
        geofences,
        registerGeofences,
        unregisterGeofences,
        geofenceEvents,
        clearGeofenceEvents
    };
};

export const useLocationWatcher = (autoStart = true, options?: Partial<LocationConfig>) => {
    const { startWatching, stopWatching, isWatching, location, error } = useLocation();

    useEffect(() => {
        if (autoStart) {
            startWatching(options);
            return () => stopWatching();
        }
    }, [autoStart, startWatching, stopWatching, options]);

    return { location, isWatching, error, startWatching, stopWatching };
};

export const useLocationFeatures = () => {
    const {
        getFeatureRequirements,
        getFeatureStatus,
        getFeatureGuide,
        getPlatformRequirements,
        warnings,
        suggestions
    } = useLocation();

    return {
        getFeatureRequirements,
        getFeatureStatus,
        getFeatureGuide,
        getPlatformRequirements,
        warnings,
        suggestions
    };
};

import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { AppState, AppStateStatus } from 'react-native';

import * as Location from 'expo-location';



export interface LocationConfig {
    /**
     * Automatically start watching location updates when the provider mounts.
     * 
     * Set to `false` for on-demand location fetching only (recommended for battery efficiency).
     * 
     * @default false
     */
    autoWatch?: boolean;

    /**
     * Fetch the user's location once when the provider mounts (if permission is granted).
     * 
     * Useful for caching an initial position without continuous tracking.
     * 
     * @default true
     */
    fetchInitial?: boolean;

    /**
     * GPS accuracy level for location requests.
     * 
     * Higher accuracy uses more battery. Options: `Lowest`, `Low`, `Balanced`, `High`, `Highest`, `BestForNavigation`.
     * 
     * @default Location.Accuracy.Balanced
     */
    accuracy?: Location.Accuracy;

    /**
     * Maximum age (in milliseconds) for cached location data.
     * 
     * If cached location is newer than this, `getCurrentLocation()` will return cached data instead of making a new GPS request.
     * 
     * @default 300000 (5 minutes)
     */
    maxCacheAge?: number;
}



export interface LocationData {
    /** Whether location permission was granted */
    granted: boolean;

    /** The location object, or null if unavailable */
    location: Location.LocationObject | null;

    /** GPS accuracy in meters (if available) */
    accuracy?: number;

    /** Timestamp when location was fetched */
    timestamp?: number;

    /** Whether this location came from cache */
    fromCache?: boolean;
}



export enum LocationErrorType {
    PERMISSION_DENIED = 'permission_denied',
    POSITION_UNAVAILABLE = 'position_unavailable',
    TIMEOUT = 'timeout',
    NETWORK_ERROR = 'network_error',
    UNKNOWN = 'unknown'
}



export interface LocationError {
    type: LocationErrorType;
    message: string;
    code?: string;
}



export interface LocationContextType {
    location: Location.LocationObject | null;
    error: LocationError | null;
    lastUpdated: number | null;
    hasPermission: boolean;
    isWatching: boolean;
    config: LocationConfig;

    requestPermission: () => Promise<boolean>;
    getCurrentLocation: (options?: Partial<LocationConfig>) => Promise<LocationData>;
    startWatching: (options?: Partial<LocationConfig>) => Promise<void>;
    stopWatching: () => void;
    updateConfig: (newConfig: Partial<LocationConfig>) => void;
}



const DEFAULT_CONFIG: LocationConfig = {
    autoWatch: false,
    fetchInitial: true,
    accuracy: Location.Accuracy.Balanced,
    maxCacheAge: 5 * 60 * 1000
}





const LocationContext = createContext<LocationContextType | undefined>(undefined);





interface LocationProviderProps { 
    children: ReactNode;
    config?: Partial<LocationConfig>;
}

export const LocationProvider = ({ children, config: initialConfig = {} }: LocationProviderProps) => {
    const [config, setConfig] = useState<LocationConfig>({
        ...DEFAULT_CONFIG,
        ...initialConfig
    });

    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [error, setError] = useState<LocationError | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [hasPermission, setHasPermission] = useState(false);
    const [isWatching, setIsWatching] = useState(false);

    const appState = useRef<AppStateStatus>(AppState.currentState);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastLocationRef = useRef<Location.LocationObject | null>(null);
    const isMountedRef = useRef<boolean>(true);
    const isWatchingRef = useRef<boolean>(false);
    const watchIntentRef = useRef<boolean>(false);



    const handleError = useCallback((error: any, type: LocationErrorType = LocationErrorType.UNKNOWN) => {
        const locationError: LocationError = {
            type,
            message: error?.message || 'An unknown error occurred',
            code: error?.code
        };
        setError(locationError);
    }, []);



    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isMountedRef.current) {
            return false;
        }

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            const granted = status === 'granted';

            setHasPermission(granted);

            if (!granted) {
                handleError(new Error('Location permission was denied'), LocationErrorType.PERMISSION_DENIED);
            }
            setError(null);
            return granted;
        } catch (error) {
            handleError(error, LocationErrorType.PERMISSION_DENIED);
            return false;
        }
    }, [handleError]);



    const getCurrentLocation = useCallback(async (options: Partial<LocationConfig> = {}): Promise<LocationData> => {
        if (!isMountedRef.current) {
            return { granted: false, location: null };
        }

        const mergedOptions = { ...config, ...options };

        // Check cache first.
        if (lastLocationRef.current && lastUpdated) {
            const cacheAge = Date.now() - lastUpdated;
            if (cacheAge < mergedOptions.maxCacheAge!) {
                return {
                    granted: true,
                    location: lastLocationRef.current,
                    timestamp: lastUpdated,
                    fromCache: true
                };
            }
        }

        if (!hasPermission) {
            const granted = await requestPermission();
            if (!granted) {
                return { granted: false, location: null };
            }
        }

        setError(null);

        try {
            const currentLocation = await Location.getCurrentPositionAsync({ accuracy: mergedOptions.accuracy! });

            if (isMountedRef.current) {
                setLocation(currentLocation);
                setLastUpdated(Date.now());
                lastLocationRef.current = currentLocation;
            }

            return {
                granted: true,
                location: currentLocation,
                accuracy: currentLocation.coords.accuracy ?? undefined,
                timestamp: Date.now(),
                fromCache: false
            };
        } catch (error) {
            handleError(error, LocationErrorType.POSITION_UNAVAILABLE);
            return { granted: true, location: null };
        }
    }, [config, hasPermission, lastUpdated, requestPermission, handleError]);



    const startWatching = useCallback(async (options: Partial<LocationConfig> = {}): Promise<void> => {
        if (!isMountedRef.current || isWatchingRef.current) {
            return;
        }
        const mergedOptions = { ...config, ...options };

        if (!hasPermission) {
            const granted = await requestPermission();
            if (!granted) {
                return;
            }
        }

        // Stop any existing subscription.
        if (locationSubscription.current) {
            locationSubscription.current.remove();
        }

        try {
            isWatchingRef.current = true;
            setIsWatching(true);
            watchIntentRef.current = true;
            setError(null);
            
            locationSubscription.current = await Location.watchPositionAsync(
                { accuracy: mergedOptions.accuracy! },
                (newLocation) => {
                    if (!isMountedRef.current) {
                        return;
                    }
                    setLocation(newLocation);
                    setLastUpdated(Date.now());
                    lastLocationRef.current = newLocation;
                }
            );
        } catch (error) {
            handleError(error, LocationErrorType.POSITION_UNAVAILABLE);
            isWatchingRef.current = false;
            setIsWatching(false);
            watchIntentRef.current = false;
        }
    }, [config, hasPermission, requestPermission, handleError]);



    const stopWatching = useCallback((): void => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        isWatchingRef.current = false;
        setIsWatching(false);
        watchIntentRef.current = false;
    }, []);



    const updateConfig = useCallback((newConfig: Partial<LocationConfig>) => {
        setConfig(prevConfig => ({ ...prevConfig, ...newConfig }));

        // If currently watching, restart with new config.
        if (isWatchingRef.current) {
            stopWatching();
            startWatching(newConfig);
        }
    }, [stopWatching, startWatching]);



    const handleAppStateChange = useCallback((nextAppState: AppStateStatus): void => {
        if (!isMountedRef.current) {
            return;
        }

        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            // App has come to the foreground.
            if (hasPermission && !isWatchingRef.current && watchIntentRef.current) {
                startWatching();
            }
        } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            // App has gone to the background.
            if (isWatchingRef.current) {
                watchIntentRef.current = true;
                stopWatching();
            }
        }
        appState.current = nextAppState;
    }, [hasPermission, startWatching, stopWatching]);



    // Initial setup.
    useEffect(() => {
        isMountedRef.current = true;

        const initializeLocation = async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                const permissionGranted = status === 'granted';
                setHasPermission(permissionGranted);
    
                if (permissionGranted && config.fetchInitial) {
                    try {
                        const currentLocation = await Location.getCurrentPositionAsync({ 
                            accuracy: config.accuracy! 
                        });
                        if (isMountedRef.current) {
                            setLocation(currentLocation);
                            setLastUpdated(Date.now());
                            lastLocationRef.current = currentLocation;
                        }
                    } catch (error) {
                        setError({
                            type: LocationErrorType.POSITION_UNAVAILABLE,
                            message: 'Failed to get current location',
                            code: (error as any)?.code
                        });
                    }

                    // If autoWatch is off, do not start watching location.
                    if (!config.autoWatch) {
                        return;
                    }

                    try {
                        if (locationSubscription.current) {
                            locationSubscription.current.remove();
                        }
                        
                        isWatchingRef.current = true;
                        setIsWatching(true);
                        watchIntentRef.current = true;
                        setError(null);
                        
                        locationSubscription.current = await Location.watchPositionAsync(
                            { accuracy: config.accuracy! },
                            (newLocation) => {
                                if (!isMountedRef.current) {
                                    return;
                                }
                                setLocation(newLocation);
                                setLastUpdated(Date.now());
                                lastLocationRef.current = newLocation;
                            }
                        );
                    } catch (error) {
                        setError({
                            type: LocationErrorType.POSITION_UNAVAILABLE,
                            message: 'Failed to start watching location',
                            code: (error as any)?.code
                        });
                        isWatchingRef.current = false;
                        watchIntentRef.current = false;
                        setIsWatching(false);
                    }
                }
            } catch (error) {
                setError({
                    type: LocationErrorType.PERMISSION_DENIED,
                    message: 'Permission request failed',
                    code: (error as any)?.code
                });
            }
        };

        initializeLocation();

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            isMountedRef.current = false;
            if (locationSubscription.current) {
                locationSubscription.current.remove();
                locationSubscription.current = null;
            }
            isWatchingRef.current = false;
            setIsWatching(false);
            subscription?.remove();
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [config]);

    const contextValue = useMemo((): LocationContextType => ({
      location,
      error,
      lastUpdated,
      hasPermission,
      isWatching,
      config,
      requestPermission,
      getCurrentLocation,
      startWatching,
      stopWatching,
      updateConfig,
    }), [
      location,
      error,
      lastUpdated,
      hasPermission,
      isWatching,
      config,
      requestPermission,
      getCurrentLocation,
      startWatching,
      stopWatching,
      updateConfig,
    ]);
  
    return (
        <LocationContext.Provider value={contextValue}>
            {children}
        </LocationContext.Provider>
    );
}





export const useLocation = (): LocationContextType => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
}



export const useCurrentLocation = (options?: Partial<LocationConfig>) => {
    const { getCurrentLocation, error } = useLocation();
    
    const fetchLocation = useCallback(async () => {
        return await getCurrentLocation(options);
    }, [getCurrentLocation, options]);

    return { fetchLocation, error };
}


export const useLocationWatcher = (autoStart = true, options?: Partial<LocationConfig>) => {
    const { startWatching, stopWatching, isWatching, location, error } = useLocation();
    const stableOptions = useMemo(() => options, [JSON.stringify(options)]);
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (autoStart && !hasInitialized.current) {
            hasInitialized.current = true;
            startWatching(stableOptions);
        }
        
        return () => {
            if (hasInitialized.current) {
                hasInitialized.current = false;
                stopWatching();
            }
        };
    }, [autoStart]);

    useEffect(() => {
        if (!autoStart) {
            hasInitialized.current = false;
        }
    }, [autoStart]);

    return { location, isWatching, error, startWatching, stopWatching };
};
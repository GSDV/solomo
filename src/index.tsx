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
    accuracy?: Location.Accuracy;
    maxCacheAge?: number;
}



export interface LocationData {
    granted: boolean;
    location: Location.LocationObject | null;
    accuracy?: number;
    timestamp?: number;
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
    accuracy: Location.Accuracy.Highest,
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

    const appState = useRef(AppState.currentState);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastLocationRef = useRef<Location.LocationObject | null>(null);
    const isMountedRef = useRef(true);



    const handleError = useCallback((error: any, type: LocationErrorType = LocationErrorType.UNKNOWN) => {
        const locationError: LocationError = {
            type,
            message: error?.message || 'An unknown error occurred',
            code: error?.code
        };
        setError(locationError);
    }, []);



    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isMountedRef.current) return false;

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            const granted = status === 'granted';

            setHasPermission(granted);

            if (!granted) handleError(new Error('Location permission was denied'), LocationErrorType.PERMISSION_DENIED);
            setError(null);
            return granted;
        } catch (error) {
            handleError(error, LocationErrorType.PERMISSION_DENIED);
            return false;
        }
    }, [handleError]);



    const getCurrentLocation = useCallback(async (options: Partial<LocationConfig> = {}): Promise<LocationData> => {
        if (!isMountedRef.current) return { granted: false, location: null };

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
            if (!granted) return { granted: false, location: null };
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
        if (!isMountedRef.current || isWatching) return;
        const mergedOptions = { ...config, ...options };

        if (!hasPermission) {
            const granted = await requestPermission();
            if (!granted) return;
        }

        // Stop any existing subscription.
        if (locationSubscription.current) locationSubscription.current.remove();

        try {
            setIsWatching(true);
            setError(null);
            
            locationSubscription.current = await Location.watchPositionAsync(
                { accuracy: mergedOptions.accuracy! },
                (newLocation) => {
                    if (!isMountedRef.current) return;
                    setLocation(newLocation);
                    setLastUpdated(Date.now());
                    lastLocationRef.current = newLocation;
                }
            );
        } catch (error) {
            handleError(error, LocationErrorType.POSITION_UNAVAILABLE);
            setIsWatching(false);
        }
    }, [config, hasPermission, isWatching, requestPermission, handleError]);



    const stopWatching = useCallback((): void => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        setIsWatching(false);
    }, []);



    const updateConfig = useCallback((newConfig: Partial<LocationConfig>) => {
        setConfig(prevConfig => ({ ...prevConfig, ...newConfig }));

        // If currently watching, restart with new config.
        if (isWatching) {
            stopWatching();
            startWatching(newConfig);
        }
    }, [isWatching, stopWatching, startWatching]);



    const handleAppStateChange = useCallback((nextAppState: AppStateStatus): void => {
        if (!isMountedRef.current) return;

        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            // App has come to the foreground.
            if (hasPermission && !isWatching) startWatching();
        } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            // App has gone to the background.
            stopWatching();
        }
        appState.current = nextAppState;
    }, [hasPermission, isWatching, startWatching, stopWatching]);



    // Initial setup.
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
        }

        initializeLocation();

        const subscription = AppState.addEventListener('change', handleAppStateChange);
  
        // Cleanup function.
        return () => {
            isMountedRef.current = false;
            stopWatching();
            subscription?.remove();
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        };
    }, []);

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

    useEffect(() => {
        if (autoStart) {
            startWatching(options);
            return () => stopWatching();
        }
    }, [autoStart, startWatching, stopWatching, options]);

    return { location, isWatching, error, startWatching, stopWatching };
}
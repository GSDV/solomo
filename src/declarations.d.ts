declare module 'expo-location' {
	export type LocationObject = any;
	export type Accuracy = any;
	export type LocationSubscription = any;
	export const Accuracy: any;
	export const LocationObject: any;
	export const LocationSubscription: any;
	export function requestForegroundPermissionsAsync(...args: any[]): any;
	export function getForegroundPermissionsAsync(...args: any[]): any;
	export function enableNetworkProviderAsync(...args: any[]): any;
	export function getCurrentPositionAsync(...args: any[]): any;
	export function reverseGeocodeAsync(...args: any[]): any;
	export function watchPositionAsync(...args: any[]): any;
	const Location: any;
	export default Location;
}
declare module 'expo-maps' {
	export const AppleMaps: any;
	export const GoogleMaps: any;
}

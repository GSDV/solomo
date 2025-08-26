import { AppleMaps, GoogleMaps } from "expo-maps";
import React from "react";
import { Platform, Text, View } from "react-native";
import { useLocation } from "./Context";

export const LocationMap: React.FC = () => {
    const { location } = useLocation();

    if (!location || !location.coords) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ color: "gray" }}>Location not available</Text>
            </View>
        );
    }

    const { latitude, longitude } = location.coords;

    return Platform.OS === "ios" ? (
        <AppleMaps.View
            style={{ flex: 1 }}
            cameraPosition={{
                coordinates: { latitude, longitude },
                zoom: 14,
            }}
            markers={[{
                coordinates: { latitude, longitude },
                title: "You are here",
                id: "user-location"
            }]}
        />
    ) : (
        <GoogleMaps.View
            style={{ flex: 1 }}
            cameraPosition={{
                coordinates: { latitude, longitude },
                zoom: 14,
            }}
            markers={[{
                coordinates: { latitude, longitude },
                title: "You are here",
                id: "user-location"
            }]}
        />
    );
};

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const port = 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// --- Mock Data ---
// Updated to include more stations within 300km of Kuttichal for testing.
let stations = [
    { id: '1', lat: 8.48, lng: 76.95, status: 'busy' }, // Near Thiruvananthapuram (~20km)
    { id: '2', lat: 8.89, lng: 76.61, status: 'available' }, // Near Kollam (~50km)
    { id: '3', lat: 9.9770, lng: 76.2910, status: 'busy' }, // Kochi (~150km)
    { id: '4', lat: 10.51, lng: 76.21, status: 'available' }, // Thrissur (~180km)
    { id: '5', lat: 11.25, lng: 75.78, status: 'busy' }, // Kozhikode (~280km)
    // Station for Kuttichal, which is your current location
    { id: '6', lat: 8.5283, lng: 77.0543, status: 'available' },
];

// --- Simulated AI Logic ---
function predictWaitTime() {
    const now = new Date();
    const currentHour = now.getHours();
    // Peak hours from 8-10 AM and 5-8 PM
    if ((currentHour >= 17 && currentHour <= 20) || (currentHour >= 8 && currentHour <= 10)) {
        return '25 mins';
    } else {
        return '5 mins';
    }
}

// Helper function to calculate distance between two points (in kilometers)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

// Store the user's location for each connection
const userLocations = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Listen for the user's location from the frontend
    socket.on('user_location', (userLocation) => {
        console.log(`User ${socket.id} sent location:`, userLocation);
        userLocations[socket.id] = userLocation;

        // Filter stations based on the user's location, within a 300km radius
        const nearbyStations = stations.filter(station => {
            const distance = getDistance(userLocation.lat, userLocation.lng, station.lat, station.lng);
            return distance <= 300; // Show stations within 300km
        });

        const stationsWithPredictions = nearbyStations.map(s => ({ ...s, wait_time: predictWaitTime() }));
        socket.emit('initial_stations', stationsWithPredictions);
    });

    // Simulate real-time updates every 5 seconds
    setInterval(() => {
        if (userLocations[socket.id]) {
            // Randomly change a station's status
            const randomStationIndex = Math.floor(Math.random() * stations.length);
            const randomStatus = stations[randomStationIndex].status === 'busy' ? 'available' : 'busy';
            stations[randomStationIndex].status = randomStatus;

            // Refilter and update the nearby stations
            const nearbyStations = stations.filter(station => {
                const distance = getDistance(userLocations[socket.id].lat, userLocations[socket.id].lng, station.lat, station.lng);
                return distance <= 300;
            });

            const updatedStations = nearbyStations.map(s => ({ ...s, wait_time: predictWaitTime() }));
            socket.emit('station_update', updatedStations);
        }
    }, 5000);

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        delete userLocations[socket.id];
    });
});

server.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

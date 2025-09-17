let map;
let markers = [];
let infoWindow;
let socket;
let directionsService;
let directionsRenderer;
let userLocation;

// This function is the callback for the Google Maps API script
window.initMap = function() {
    // Initialize the Directions Service and Renderer
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setPanel(document.getElementById("panel"));
    
    // Check if the browser supports geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                console.log("Current user location:", userLocation);
                
                // Initialize the map centered on the user's location
                map = new google.maps.Map(document.getElementById('map'), {
                    zoom: 12,
                    center: userLocation,
                });
                
                directionsRenderer.setMap(map);
                infoWindow = new google.maps.InfoWindow();
                
                // Add a marker for the user's current location
                new google.maps.Marker({
                    position: userLocation,
                    map: map,
                    title: "You are here!",
                    icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                });

                // Initialize the Socket.IO connection and send the user's location
                socket = io('http://localhost:3000');
                socket.emit('user_location', userLocation);

                // Listen for the initial station data from the server
                socket.on('initial_stations', (stations) => {
                    console.log("Initial stations received:", stations);
                    clearMarkers();
                    renderStations(stations);
                });

                // Listen for real-time updates from the server
                socket.on('station_update', (stations) => {
                    console.log("Real-time update received:", stations);
                    clearMarkers();
                    renderStations(stations);
                });
                
                socket.on('connect_error', (err) => {
                    console.error('Connection Error:', err.message);
                });
            },
            () => {
                handleLocationError(true);
            }
        );
    } else {
        // Browser doesn't support Geolocation
        handleLocationError(false);
    }
}

// Function to handle geolocation errors
function handleLocationError(browserHasGeolocation) {
    const defaultCenter = { lat: 9.9816, lng: 76.2999 };
    const errorMessage = browserHasGeolocation ?
        "Error: The Geolocation service failed." :
        "Error: Your browser doesn't support geolocation.";

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: defaultCenter,
    });
    showMessage(errorMessage);
}

// Function to render markers on the map and populate the sidebar
function renderStations(stations) {
    const stationListContainer = document.getElementById('station-list');
    const panelContainer = document.getElementById('panel');
    
    stationListContainer.innerHTML = '';
    panelContainer.innerHTML = '';
    panelContainer.classList.add('hidden'); // Hide the panel initially
    
    stations.forEach(station => {
        const marker = new google.maps.Marker({
            position: { lat: station.lat, lng: station.lng },
            map: map,
            title: `Station ${station.id}`,
            icon: getMarkerIcon(station.status)
        });

        // Added a "Get Directions" button to the info window content
        const contentString = `
            <div>
                <h3>Station ${station.id}</h3>
                <p>Status: <span class="status ${station.status}">${station.status}</span></p>
                <p>Wait Time: <strong>${station.wait_time}</strong></p>
                <button class="directions-button" data-lat="${station.lat}" data-lng="${station.lng}">Get Directions</button>
            </div>
        `;

        marker.addListener('click', () => {
            infoWindow.setContent(contentString);
            infoWindow.open(map, marker);
        });
        
        // Add click listener to the new button inside the info window
        google.maps.event.addListener(infoWindow, 'domready', () => {
            document.querySelector('.directions-button').addEventListener('click', (e) => {
                const destination = {
                    lat: parseFloat(e.target.dataset.lat),
                    lng: parseFloat(e.target.dataset.lng)
                };
                calculateAndDisplayRoute(userLocation, destination);
            });
        });

        markers.push(marker);

        // Added a "Get Directions" button to the sidebar card
        const stationCard = document.createElement('div');
        stationCard.className = 'station-card';
        stationCard.innerHTML = `
            <h3>Station ${station.id}</h3>
            <p>Status: <span class="status-label ${station.status}">${station.status}</span></p>
            <p>Predicted Wait Time: <strong>${station.wait_time}</strong></p>
            <button class="directions-button-card" data-lat="${station.lat}" data-lng="${station.lng}">Get Directions</button>
        `;
        stationListContainer.appendChild(stationCard);
    });

    // Add a single event listener for all directions buttons in the sidebar
    document.querySelectorAll('.directions-button-card').forEach(button => {
        button.addEventListener('click', (e) => {
            const destination = {
                lat: parseFloat(e.target.dataset.lat),
                lng: parseFloat(e.target.dataset.lng)
            };
            calculateAndDisplayRoute(userLocation, destination);
        });
    });
}

function calculateAndDisplayRoute(origin, destination) {
    if (!origin) {
        showMessage("Your location is not available. Please allow geolocation and try again.");
        return;
    }

    directionsService.route({
        origin: origin,
        destination: destination,
        travelMode: 'DRIVING'
    }, (response, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(response);
            // Hide station list and show directions panel
            document.getElementById('station-list').innerHTML = '';
            document.getElementById('station-list').classList.add('hidden');
            document.getElementById('panel').classList.remove('hidden');
        } else {
            showMessage('Directions request failed due to ' + status);
        }
    });
}

function getMarkerIcon(status) {
    const baseUrl = 'http://maps.google.com/mapfiles/ms/icons/';
    if (status === 'available') {
        return baseUrl + 'green-dot.png';
    } else {
        return baseUrl + 'red-dot.png';
    }
}

function clearMarkers() {
    for (let i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
    markers = [];
}

// Custom message box functions
function showMessage(message) {
    const messageBox = document.getElementById('message-box');
    const messageContent = document.getElementById('message-content');
    messageContent.innerText = message;
    messageBox.classList.remove('hidden');
}

document.getElementById('message-close').addEventListener('click', () => {
    document.getElementById('message-box').classList.add('hidden');
});


// ====================================================================
// CHATBOT LOGIC
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    const chatbotContainer = document.getElementById('chatbot-container');
    const toggleButton = document.getElementById('toggle-chatbot-button');
    const closeButton = document.getElementById('close-chatbot-button');
    const chatBody = document.getElementById('chat-body');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    let chatHistory = [];
    let isTyping = false;
    
    toggleButton.addEventListener('click', () => {
        chatbotContainer.classList.toggle('hidden');
    });

    closeButton.addEventListener('click', () => {
        chatbotContainer.classList.add('hidden');
    });
    
    async function getGeminiResponse(prompt) {
        isTyping = true;
        addMessage('bot', `<div class="loading-dots flex items-end"><span class="w-2 h-2 bg-gray-500 rounded-full mr-1"></span><span class="w-2 h-2 bg-gray-500 rounded-full mr-1"></span><span class="w-2 h-2 bg-gray-500 rounded-full"></span></div>`);
        
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        
        const payload = {
            contents: chatHistory
        };

        const apiKey = "AIzaSyBteVeGJpp8k-j7Q_9hBk-fRV3BeoB3XIw";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                chatHistory.push({ role: "model", parts: [{ text: text }] });
                updateLastMessage('bot', text);
            } else {
                updateLastMessage('bot', "I'm sorry, I couldn't generate a response. Please try again.");
            }

        } catch (error) {
            console.error('Error fetching data from Gemini API:', error);
            updateLastMessage('bot', "An error occurred. Please try again later.");
        } finally {
            isTyping = false;
        }
    }
    
    function addMessage(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
        messageElement.innerHTML = message;
        chatBody.appendChild(messageElement);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function updateLastMessage(sender, message) {
        const lastMessage = chatBody.lastChild;
        if (lastMessage && lastMessage.classList.contains('bot-message')) {
            lastMessage.innerHTML = message;
        } else {
            addMessage(sender, message);
        }
        chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    function sendMessage() {
        const prompt = userInput.value.trim();
        if (prompt !== '' && !isTyping) {
            addMessage('user', prompt);
            userInput.value = '';
            getGeminiResponse(prompt);
        }
    }

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});

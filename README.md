# Flight Routes API Server (Node.js)

A high-performance Node.js API server for airline route data. This server is optimized for read-only access to a static SQLite database of flight routes.

## Features

- **High Performance**: Uses better-sqlite3 for efficient database access
- **Pre-compiled Queries**: Common queries are prepared ahead of time
- **RESTful API**: Clean API endpoints for all data access
- **Comprehensive Filtering**: Filter routes by airline, airport, country, and flight duration
- **Pagination**: Built-in pagination for large result sets

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/flight-routes-api.git
cd flight-routes-api
```

2. **Install dependencies**

```bash
npm install
```

3. **Place the database file**

Ensure your `routes.db` SQLite database file is located in the root directory of the project.

4. **Start the server**

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Database Schema

The API interacts with a SQLite database with the following structure:

### Tables
- **airports**: Information about airports (IATA codes, names, locations)
- **airlines**: Information about airlines
- **routes**: Flight connections between airports
- **route_airlines**: Junction table linking routes to airlines

### Views
- **route_details**: A view joining the tables for efficient queries, with the following structure:
  - `route_id`: Route identifier
  - `departure_iata`: IATA code of departure airport
  - `departure_city`: City name of departure
  - `departure_country`: Country of departure
  - `arrival_iata`: IATA code of arrival airport
  - `arrival_city`: City name of arrival
  - `arrival_country`: Country of arrival
  - `distance_km`: Distance in kilometers
  - `duration_min`: Flight duration in minutes
  - `airline_iata`: IATA code of airline
  - `airline_name`: Name of airline

## API Endpoints

### Basic Information

#### `GET /health`
Check if the server is running.

Response:
```json
{ "status": "ok" }
```

#### `GET /stats`
Get database statistics, including counts and top airlines/airports.

Response:
```json
{
  "counts": {
    "airports": 7346,
    "airlines": 548,
    "routes": 67663,
    "countries": 237
  },
  "top_airlines": [
    {
      "name": "Ryanair",
      "route_count": 7684
    },
    // More airlines...
  ],
  "top_departure_airports": [
    {
      "name": "Los Angeles International Airport",
      "city_name": "Los Angeles",
      "country": "United States",
      "route_count": 172
    },
    // More airports...
  ]
}
```

### Airlines and Airports

#### `GET /airlines`
Get a list of all airlines.

Response:
```json
{
  "airlines": [
    {
      "id": 1,
      "iata": "RE",
      "name": "Stobart Air"
    },
    // More airlines...
  ]
}
```

#### `GET /airports`
Get airports with optional filtering.

Query parameters:
- `country`: Filter by country name
- `continent`: Filter by continent code

Response:
```json
{
  "airports": [
    {
      "iata": "LHR",
      "name": "London Heathrow Airport",
      "city_name": "London",
      "country": "United Kingdom",
      "country_code": "GB",
      "continent": "EU",
      "latitude": 51.4775,
      "longitude": -0.461389
    },
    // More airports...
  ]
}
```

#### `GET /countries`
Get a list of all countries with airports.

Response:
```json
{
  "countries": [
    {
      "country": "Afghanistan",
      "country_code": "AF",
      "continent": "AS"
    },
    // More countries...
  ]
}
```

### Routes

#### `GET /routes`
Get routes with comprehensive filtering.

Query parameters:
- `airline_id`: Filter by airline ID
- `airline_name`: Filter by airline name (supports partial matching)
- `departure_iata`: Filter by departure airport code
- `arrival_iata`: Filter by arrival airport code
- `departure_country`: Filter by departure country
- `arrival_country`: Filter by arrival country
- `max_duration`: Filter by maximum duration in minutes
- `min_duration`: Filter by minimum duration in minutes
- `all`: Set to 'true' to return all matching results without pagination (default: 'false')
- `limit`: Number of results to return when paginating (default: 100)
- `offset`: Offset for pagination (default: 0)

Response:
```json
{
  "routes": [
    {
      "route_id": 12345,
      "departure_iata": "LHR",
      "departure_city": "London",
      "departure_country": "United Kingdom",
      "arrival_iata": "CDG",
      "arrival_city": "Paris",
      "arrival_country": "France",
      "distance_km": 344,
      "duration_min": 75,
      "airline_iata": "BA",
      "airline_name": "British Airways"
    },
    // More routes...
  ],
  "pagination": {
    "total": 67,
    "returnedCount": 10,
    "limit": 10,
    "offset": 0,
    "all": false
  }
}
```

#### `GET /airports/:iata/routes`
Get routes from or to a specific airport.

Path parameters:
- `iata`: IATA code of the airport

Query parameters:
- `direction`: Either 'departure' (default) or 'arrival'
- `airline_id`: Filter by airline ID
- `airline_name`: Filter by airline name (supports partial matching)
- `all`: Set to 'true' to return all matching results without pagination (default: 'true')
- `limit`: Number of results to return when paginating (used when all=false)
- `offset`: Offset for pagination (used when all=false)

Response:
```json
{
  "airport": "LHR",
  "direction": "departure",
  "total": 89,
  "returnedCount": 89,
  "all": true,
  "routes": [
    {
      "route_id": 12345,
      "departure_iata": "LHR",
      "departure_city": "London",
      "departure_country": "United Kingdom",
      "arrival_iata": "CDG",
      "arrival_city": "Paris",
      "arrival_country": "France",
      "distance_km": 344,
      "duration_min": 75,
      "airline_iata": "BA",
      "airline_name": "British Airways"
    },
    // More routes...
  ]
}
```

#### `GET /countries/:country/routes`
Get routes from or to a specific country.

Path parameters:
- `country`: Country name

Query parameters:
- `direction`: Either 'departure' (default) or 'arrival'
- `destination_country`: Filter by destination country
- `airline_name`: Filter by airline name (supports partial matching)
- `all`: Set to 'true' to return all matching results without pagination (default: 'false')
- `limit`: Number of results to return when paginating (default: 100)
- `offset`: Offset for pagination (default: 0)

Response:
```json
{
  "country": "United Kingdom",
  "direction": "departure",
  "destination_country": "France",
  "total": 153,
  "returnedCount": 100,
  "all": false,
  "routes": [
    {
      "route_id": 12345,
      "departure_iata": "LHR",
      "departure_city": "London",
      "departure_country": "United Kingdom",
      "arrival_iata": "CDG",
      "arrival_city": "Paris",
      "arrival_country": "France",
      "distance_km": 344,
      "duration_min": 75,
      "airline_iata": "BA",
      "airline_name": "British Airways"
    },
    // More routes...
  ]
}
```

## Example Queries

### Get all flights from London Heathrow (LHR)
```
GET /airports/LHR/routes?direction=departure
```

### Get all flights to New York JFK
```
GET /airports/JFK/routes?direction=arrival
```

### Get all British Airways flights under 2 hours
```
GET /routes?airline_name=British%20Airways&max_duration=120
```

### Get all routes between UK and France
```
GET /routes?departure_country=United%20Kingdom&arrival_country=France
```

## Performance Considerations

This server is optimized for read-only access to a static database:

1. **better-sqlite3**: Uses a high-performance SQLite library for Node.js
2. **Prepared Statements**: Common queries are compiled once for repeated execution
3. **Read-only Mode**: Opens the database in read-only mode for better performance
4. **Parameterized Queries**: Uses parameters to prevent SQL injection and improve cache hits

## Error Handling

The API returns appropriate HTTP status codes:

- **200**: Successful request
- **400**: Bad request (invalid parameters)
- **500**: Server error

## Development

To modify the server:

1. Fork the repository
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## Testing the API

A test script is provided to verify API functionality. To run the tests:

```bash
node test-api.js
```

This will run a series of test requests against all endpoints to ensure they're functioning correctly.

# Example Queries for Retrieving Complete Datasets

Below are examples of how to use the API to retrieve complete datasets for different scenarios.

## All British Airways Flights from London

To get all British Airways flights departing from London Heathrow (LHR), you can use:

```
GET /airports/LHR/routes?airline_name=British%20Airways&direction=departure
```

Since the `/airports/:iata/routes` endpoint defaults to `all=true`, this will return the complete list without pagination.

## All Routes Between Two Countries

To get all routes between the United Kingdom and France:

```
GET /routes?departure_country=United%20Kingdom&arrival_country=France&all=true
```

By adding `all=true`, the server will return the complete result set instead of paginating.

## All Routes for a Specific Airline

To get all routes operated by a specific airline:

```
GET /routes?airline_name=Lufthansa&all=true
```

## All Short Flights (Under 60 Minutes)

To get all short-duration flights:

```
GET /routes?max_duration=60&all=true
```

## Handling Large Datasets

For very large datasets, you may want to use pagination instead of retrieving all results at once. For example:

```
GET /routes?departure_country=United%20States&limit=500&offset=0
```

Then increment the offset for subsequent pages:

```
GET /routes?departure_country=United%20States&limit=500&offset=500
```

## Using the API with Node.js Fetch

Here's an example of how to fetch all British Airways flights from London Heathrow using Node.js:

```javascript
async function getAllBAFlightsFromLHR() {
  try {
    const response = await fetch('http://localhost:3000/airports/LHR/routes?airline_name=British%20Airways&direction=departure');
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Found ${data.returnedCount} British Airways flights from London Heathrow`);
    
    // Process all flights
    data.routes.forEach(route => {
      console.log(`Flight to ${route.arrival_city}, ${route.arrival_country} - Duration: ${route.duration_min} minutes`);
    });
    
    return data.routes;
  } catch (error) {
    console.error('Error fetching flights:', error);
  }
}
```

## Using the API with Axios

Here's an example of how to fetch all routes between two countries using Axios:

```javascript
const axios = require('axios');

async function getAllRoutesBetweenCountries(departureCountry, arrivalCountry) {
  try {
    const response = await axios.get('http://localhost:3000/routes', {
      params: {
        departure_country: departureCountry,
        arrival_country: arrivalCountry,
        all: true
      }
    });
    
    const { routes, pagination } = response.data;
    console.log(`Found ${routes.length} routes from ${departureCountry} to ${arrivalCountry}`);
    
    // Process all routes
    routes.forEach(route => {
      console.log(`${route.departure_city} to ${route.arrival_city} via ${route.airline_name} - Duration: ${route.duration_min} minutes`);
    });
    
    return routes;
  } catch (error) {
    console.error('Error fetching routes:', error);
  }
}
```
const express = require("express");
const cors = require("cors");
const sqlite3 = require("better-sqlite3");
const path = require("path");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Database setup - use better-sqlite3 for better performance
const dbPath = path.join(__dirname, "routes.db");
const db = sqlite3(dbPath, { readonly: true, fileMustExist: true });

// Verify database structure
try {
  // Check that the route_details view exists
  const checkView = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='view' AND name='route_details'"
  );
  const view = checkView.get();

  if (!view) {
    console.error("route_details view does not exist in the database");
    process.exit(1);
  }

  // Verify the columns in the view to ensure they match what we expect
  const viewSchema = db.prepare("PRAGMA table_info(route_details)").all();
  console.log(
    "route_details view schema verified. Columns found:",
    viewSchema.map((col) => col.name).join(", ")
  );
} catch (error) {
  console.error("Error verifying database structure:", error);
  process.exit(1);
}

// Performance optimization: prepare statements in advance for common queries
const preparedStatements = {
  // Airlines
  getAllAirlines: db.prepare(
    "SELECT id, iata, name FROM airlines ORDER BY name"
  ),

  // Airports
  getAirportsByCountry: db.prepare(
    "SELECT iata, name, city_name, country, country_code, continent, latitude, longitude FROM airports WHERE country = ? ORDER BY city_name, name"
  ),
  getAirportsByContinent: db.prepare(
    "SELECT iata, name, city_name, country, country_code, continent, latitude, longitude FROM airports WHERE continent = ? ORDER BY country, city_name, name"
  ),
  getAllAirports: db.prepare(
    "SELECT iata, name, city_name, country, country_code, continent, latitude, longitude FROM airports ORDER BY country, city_name, name"
  ),

  // Countries - FIXED: Use single quotes for empty string, not double quotes
  getAllCountries: db.prepare(
    "SELECT DISTINCT country, country_code, continent FROM airports WHERE country != '' ORDER BY country"
  ),

  // Stats
  getAirportCount: db.prepare("SELECT COUNT(*) as count FROM airports"),
  getAirlineCount: db.prepare("SELECT COUNT(*) as count FROM airlines"),
  getRouteCount: db.prepare("SELECT COUNT(*) as count FROM routes"),
  // FIXED: Use single quotes for empty string, not double quotes
  getCountryCount: db.prepare(
    "SELECT COUNT(DISTINCT country) as count FROM airports WHERE country != ''"
  ),
  getTopAirlines: db.prepare(`
    SELECT a.name, COUNT(*) as route_count
    FROM route_airlines ra
    JOIN airlines a ON ra.airline_id = a.id
    GROUP BY a.id
    ORDER BY route_count DESC
    LIMIT 5
  `),
  getTopDepartureAirports: db.prepare(`
    SELECT a.name, a.city_name, a.country, COUNT(*) as route_count
    FROM routes r
    JOIN airports a ON r.departure_iata = a.iata
    GROUP BY r.departure_iata
    ORDER BY route_count DESC
    LIMIT 5
  `),
};

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get all airlines
app.get("/airlines", (req, res) => {
  try {
    const airlines = preparedStatements.getAllAirlines.all();
    res.json({ airlines });
  } catch (error) {
    console.error("Error getting airlines:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get airports with optional filtering
app.get("/airports", (req, res) => {
  try {
    const { country, continent } = req.query;
    let airports;

    if (country) {
      airports = preparedStatements.getAirportsByCountry.all(country);
    } else if (continent) {
      airports = preparedStatements.getAirportsByContinent.all(continent);
    } else {
      airports = preparedStatements.getAllAirports.all();
    }

    res.json({ airports });
  } catch (error) {
    console.error("Error getting airports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all countries
app.get("/countries", (req, res) => {
  try {
    const countries = preparedStatements.getAllCountries.all();
    res.json({ countries });
  } catch (error) {
    console.error("Error getting countries:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get routes with filtering capabilities
app.get("/routes", (req, res) => {
  try {
    const {
      airline_id,
      airline_name,
      departure_iata,
      arrival_iata,
      departure_country,
      arrival_country,
      max_duration,
      min_duration,
      limit = "100",
      offset = "0",
      all = "false",
    } = req.query;

    // Start building the query
    let query = `
      SELECT 
        route_id,
        departure_iata, departure_city, departure_country,
        arrival_iata, arrival_city, arrival_country,
        distance_km, duration_min,
        airline_iata, airline_name
      FROM route_details
    `;

    // Add filters if provided
    const params = [];
    const conditions = [];

    if (airline_id) {
      // Direct join not needed since we're using the view
      const subQuery = `
        SELECT route_id FROM route_airlines 
        WHERE airline_id = ?
      `;
      conditions.push(`route_id IN (${subQuery})`);
      params.push(airline_id);
    }

    if (airline_name) {
      conditions.push("airline_name LIKE ?");
      params.push(`%${airline_name}%`);
    }

    if (departure_iata) {
      conditions.push("departure_iata = ?");
      params.push(departure_iata);
    }

    if (arrival_iata) {
      conditions.push("arrival_iata = ?");
      params.push(arrival_iata);
    }

    if (departure_country) {
      conditions.push("departure_country = ?");
      params.push(departure_country);
    }

    if (arrival_country) {
      conditions.push("arrival_country = ?");
      params.push(arrival_country);
    }

    if (max_duration) {
      conditions.push("duration_min <= ?");
      params.push(Number(max_duration));
    }

    if (min_duration) {
      conditions.push("duration_min >= ?");
      params.push(Number(min_duration));
    }

    // Add conditions to query
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Add sorting
    query += " ORDER BY duration_min";

    // Prepare count query (without pagination)
    const countQuery = `SELECT COUNT(*) as count FROM (${query})`;

    // Get total count
    const countStmt = db.prepare(countQuery);
    const totalCount = countStmt.get(params).count;

    // Determine if we should return all results
    const returnAll = all === "true";

    // If all=true or the requested limit is greater than the total count, return all results
    if (returnAll) {
      // Execute query without pagination
      const allRoutesStmt = db.prepare(query);
      const routes = allRoutesStmt.all(params);

      res.json({
        routes,
        pagination: {
          total: totalCount,
          returnedCount: routes.length,
          all: true,
        },
      });
    } else {
      // Add pagination to main query
      query += " LIMIT ? OFFSET ?";

      // Parse limit and offset, providing defaults
      const limitNum = Number(limit) || 100;
      const offsetNum = Number(offset) || 0;

      // Get routes with pagination
      const routesStmt = db.prepare(query);
      const routes = routesStmt.all([...params, limitNum, offsetNum]);

      res.json({
        routes,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          all: false,
        },
      });
    }
  } catch (error) {
    console.error("Error getting routes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all routes from or to a specific airport
app.get("/airports/:iata/routes", (req, res) => {
  try {
    const { iata } = req.params;
    const {
      direction = "departure",
      airline_id,
      airline_name,
      all = "true", // Default to returning all routes for specific airport queries
      limit = "100",
      offset = "0",
    } = req.query;

    if (!["departure", "arrival"].includes(direction)) {
      return res.status(400).json({ error: "Invalid direction parameter" });
    }

    // Determine which field to filter based on direction
    const iataField =
      direction === "departure" ? "departure_iata" : "arrival_iata";

    // Build query
    let query = `
      SELECT 
        route_id,
        departure_iata, departure_city, departure_country,
        arrival_iata, arrival_city, arrival_country,
        distance_km, duration_min,
        airline_iata, airline_name
      FROM route_details
      WHERE ${iataField} = ?
    `;

    const params = [iata];

    // Handle airline filtering
    if (airline_id) {
      query += ` AND route_id IN (SELECT route_id FROM route_airlines WHERE airline_id = ?)`;
      params.push(Number(airline_id));
    }

    if (airline_name) {
      query += " AND airline_name LIKE ?";
      params.push(`%${airline_name}%`);
    }

    // Add sorting
    query += " ORDER BY duration_min";

    // Prepare count query (without pagination)
    const countQuery = `SELECT COUNT(*) as count FROM (${query})`;
    const countStmt = db.prepare(countQuery);
    const totalCount = countStmt.get(params).count;

    // Determine if we should return all results
    const returnAll = all === "true";

    let routes;
    if (returnAll) {
      // Execute query without pagination
      const allRoutesStmt = db.prepare(query);
      routes = allRoutesStmt.all(params);
    } else {
      // Add pagination
      query += " LIMIT ? OFFSET ?";

      // Parse limit and offset, providing defaults
      const limitNum = Number(limit) || 100;
      const offsetNum = Number(offset) || 0;

      const paginatedStmt = db.prepare(query);
      routes = paginatedStmt.all([...params, limitNum, offsetNum]);
    }

    res.json({
      airport: iata,
      direction,
      total: totalCount,
      returnedCount: routes.length,
      all: returnAll,
      routes,
    });
  } catch (error) {
    console.error("Error getting airport routes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all routes from or to a specific country
app.get("/countries/:country/routes", (req, res) => {
  try {
    const { country } = req.params;
    const {
      direction = "departure",
      destination_country,
      airline_name,
      all = "false",
      limit = "100",
      offset = "0",
    } = req.query;

    if (!["departure", "arrival"].includes(direction)) {
      return res.status(400).json({ error: "Invalid direction parameter" });
    }

    // Determine which fields to filter based on direction
    const countryField =
      direction === "departure" ? "departure_country" : "arrival_country";
    const destCountryField =
      direction === "departure" ? "arrival_country" : "departure_country";

    // Build query
    let query = `
      SELECT 
        route_id,
        departure_iata, departure_city, departure_country,
        arrival_iata, arrival_city, arrival_country,
        distance_km, duration_min,
        airline_iata, airline_name
      FROM route_details
      WHERE ${countryField} = ?
    `;

    const params = [country];

    if (destination_country) {
      query += ` AND ${destCountryField} = ?`;
      params.push(destination_country);
    }

    if (airline_name) {
      query += " AND airline_name LIKE ?";
      params.push(`%${airline_name}%`);
    }

    // Add sorting
    query += " ORDER BY duration_min";

    // Prepare count query (without pagination)
    const countQuery = `SELECT COUNT(*) as count FROM (${query})`;
    const countStmt = db.prepare(countQuery);
    const totalCount = countStmt.get(params).count;

    // Determine if we should return all results
    const returnAll = all === "true";

    let routes;
    if (returnAll) {
      // Execute query without pagination
      const allRoutesStmt = db.prepare(query);
      routes = allRoutesStmt.all(params);
    } else {
      // Add pagination
      query += " LIMIT ? OFFSET ?";

      // Parse limit and offset, providing defaults
      const limitNum = Number(limit) || 100;
      const offsetNum = Number(offset) || 0;

      const paginatedStmt = db.prepare(query);
      routes = paginatedStmt.all([...params, limitNum, offsetNum]);
    }

    res.json({
      country,
      direction,
      destination_country: destination_country || null,
      total: totalCount,
      returnedCount: routes.length,
      all: returnAll,
      routes,
    });
  } catch (error) {
    console.error("Error getting country routes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get database statistics
app.get("/stats", (req, res) => {
  try {
    const airportCount = preparedStatements.getAirportCount.get().count;
    const airlineCount = preparedStatements.getAirlineCount.get().count;
    const routeCount = preparedStatements.getRouteCount.get().count;
    const countryCount = preparedStatements.getCountryCount.get().count;
    const topAirlines = preparedStatements.getTopAirlines.all();
    const topDepartureAirports =
      preparedStatements.getTopDepartureAirports.all();

    res.json({
      counts: {
        airports: airportCount,
        airlines: airlineCount,
        routes: routeCount,
        countries: countryCount,
      },
      top_airlines: topAirlines,
      top_departure_airports: topDepartureAirports,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database loaded from ${dbPath}`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Closing database connection...");
  db.close();
  process.exit(0);
});

const axios = require('axios');

/**
 * Serverless function to proxy ClickHouse queries
 * This acts as a secure intermediary between the frontend and ClickHouse
 */
module.exports = async (req, res) => {
  // Handle preflight OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Verify API key for authentication
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or missing API key' 
    });
  }
  
  try {
    // Parse request parameters
    const { metricId } = req.query;
    const from = req.query.from || getDefaultFromDate();
    const to = req.query.to || getTodayDate();
    
    // If a specific metric is requested
    if (metricId) {
      const metricData = await fetchMetricData(metricId, from, to);
      return res.status(200).json(metricData);
    } 
    
    // If all metrics are requested
    else {
      const allMetricsData = await fetchAllMetricsData(from, to);
      return res.status(200).json(allMetricsData);
    }
  } catch (error) {
    console.error('API Error:', error.message);
    
    // Return appropriate error response
    return res.status(error.status || 500).json({ 
      error: error.code || 'ServerError', 
      message: error.message || 'Internal server error'
    });
  }
};

/**
 * Fetch data for a specific metric
 * @param {string} metricId - Metric identifier
 * @param {string} from - Start date in ISO format (YYYY-MM-DD)
 * @param {string} to - End date in ISO format (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of data points
 */
async function fetchMetricData(metricId, from, to) {
  // Get the query for this metric
  const query = getQueryForMetric(metricId, from, to);
  
  if (!query) {
    const error = new Error(`Unknown metric: ${metricId}`);
    error.status = 400;
    error.code = 'InvalidMetric';
    throw error;
  }
  
  // Execute the query against ClickHouse
  const rawData = await executeClickHouseQuery(query);
  
  // Transform the data into a consistent format
  return rawData.map(row => ({
    date: row.date,
    value: parseFloat(row.value || 0)
  }));
}

/**
 * Fetch data for all metrics
 * @param {string} from - Start date in ISO format (YYYY-MM-DD)
 * @param {string} to - End date in ISO format (YYYY-MM-DD)
 * @returns {Promise<Object>} Object with metric data
 */
async function fetchAllMetricsData(from, to) {
  // Get all metric IDs
  const metricIds = [
    'queryCount',
    'dataSize',
    'queryDuration',
    'errorRate'
  ];
  
  // Fetch each metric in parallel
  const promises = metricIds.map(metricId => 
    fetchMetricData(metricId, from, to)
      .then(data => ({ [metricId]: data }))
      .catch(error => {
        console.error(`Error fetching ${metricId}:`, error);
        return { [metricId]: [] };
      })
  );
  
  // Combine all results
  const results = await Promise.all(promises);
  return Object.assign({}, ...results);
}

/**
 * Execute a query against ClickHouse
 * @param {string} query - SQL query to execute
 * @returns {Promise<Array>} Query results
 */
async function executeClickHouseQuery(query) {
  try {
    // Check if we're in development mode
    if (process.env.NODE_ENV === 'development' && process.env.USE_MOCK_DATA === 'true') {
      console.log('Using mock data for query:', query);
      return generateMockData(query);
    }
    
    // Verify ClickHouse connection details
    if (!process.env.CLICKHOUSE_HOST || !process.env.CLICKHOUSE_USER || !process.env.CLICKHOUSE_PASSWORD) {
      throw new Error('Missing ClickHouse connection details');
    }
    
    // Execute the actual query
    const response = await axios({
      method: 'post',
      url: process.env.CLICKHOUSE_HOST,
      auth: {
        username: process.env.CLICKHOUSE_USER,
        password: process.env.CLICKHOUSE_PASSWORD
      },
      params: {
        query,
        default_format: 'JSONEachRow'
      },
      timeout: 8000 // 8 second timeout
    });
    
    return response.data;
  } catch (error) {
    // Handle ClickHouse-specific errors
    if (error.response && error.response.data) {
      console.error('ClickHouse error response:', error.response.data);
      
      const errorObj = new Error('ClickHouse query error');
      errorObj.status = 500;
      errorObj.code = 'ClickHouseError';
      errorObj.details = error.response.data;
      throw errorObj;
    }
    
    // Handle network or other errors
    console.error('Query execution error:', error.message);
    throw new Error(`Failed to execute query: ${error.message}`);
  }
}

/**
 * Get the appropriate query for a given metric
 * @param {string} metricId - Metric identifier
 * @param {string} from - Start date in ISO format
 * @param {string} to - End date in ISO format
 * @returns {string|null} SQL query or null if metric not found
 */
function getQueryForMetric(metricId, from, to) {
  // Define queries for each metric
  const queries = {
    // Number of queries executed
    queryCount: `
      SELECT 
        toDate(event_time) AS date, 
        count() AS value
      FROM system.query_log
      WHERE event_time BETWEEN '${from}' AND '${to} 23:59:59'
        AND type = 'QueryStart'
      GROUP BY date
      ORDER BY date
    `,
    
    // Amount of data processed
    dataSize: `
      SELECT 
        toDate(event_time) AS date, 
        sum(read_bytes) AS value
      FROM system.query_log
      WHERE event_time BETWEEN '${from}' AND '${to} 23:59:59'
        AND type = 'QueryFinish'
      GROUP BY date
      ORDER BY date
    `,
    
    // Average query duration
    queryDuration: `
      SELECT 
        toDate(event_time) AS date, 
        avg(query_duration_ms) / 1000 AS value
      FROM system.query_log
      WHERE event_time BETWEEN '${from}' AND '${to} 23:59:59'
        AND type = 'QueryFinish'
      GROUP BY date
      ORDER BY date
    `,
    
    // Error rate percentage
    errorRate: `
      SELECT 
        toDate(event_time) AS date, 
        countIf(exception != '') * 100 / count() AS value
      FROM system.query_log
      WHERE event_time BETWEEN '${from}' AND '${to} 23:59:59'
        AND type = 'ExceptionWhileProcessing'
      GROUP BY date
      ORDER BY date
    `
  };
  
  return queries[metricId] || null;
}

/**
 * Generate mock data for development/testing
 * @param {string} query - The original query
 * @returns {Array} Mock data points
 */
function generateMockData(query) {
  // Parse the query to determine which metric it's for
  let metricType = 'unknown';
  
  if (query.includes('count()')) {
    metricType = 'queryCount';
  } else if (query.includes('sum(read_bytes)')) {
    metricType = 'dataSize';
  } else if (query.includes('avg(query_duration_ms)')) {
    metricType = 'queryDuration';
  } else if (query.includes('countIf(exception')) {
    metricType = 'errorRate';
  }
  
  // Extract date range from query
  const fromMatch = query.match(/BETWEEN '(.+?)'/);
  const toMatch = query.match(/AND '(.+?)'/);
  
  const from = fromMatch ? fromMatch[1] : getDefaultFromDate();
  const to = toMatch ? toMatch[1].split(' ')[0] : getTodayDate();
  
  // Generate appropriate mock data
  return generateDateRangeData(from, to, metricType);
}

/**
 * Generate mock data for a date range
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string} metricType - Type of metric
 * @returns {Array} Generated data
 */
function generateDateRangeData(from, to, metricType) {
  const data = [];
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const currentDate = new Date(fromDate);
  
  // Generate data for each day in the range
  while (currentDate <= toDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    let value;
    switch (metricType) {
      case 'queryCount':
        value = Math.floor(Math.random() * 1000) + 500;
        break;
      case 'dataSize':
        value = Math.floor(Math.random() * 1000000000) + 100000000;
        break;
      case 'queryDuration':
        value = Math.random() * 2 + 0.1;
        break;
      case 'errorRate':
        value = Math.random() * 2;
        break;
      default:
        value = Math.random() * 100;
    }
    
    data.push({ date: dateStr, value });
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return data;
}

/**
 * Get the default "from" date (7 days ago)
 * @returns {string} Date in YYYY-MM-DD format
 */
function getDefaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date
 * @returns {string} Date in YYYY-MM-DD format
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}
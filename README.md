# ClickHouse API Proxy

A secure API proxy for fetching ClickHouse metrics data without exposing credentials to the frontend.

## Features

- Securely connects to ClickHouse Cloud
- Handles authentication via API keys
- Fetches metrics data for dashboard visualization
- Supports multiple metrics out of the box
- Provides mocking capabilities for development
- Easy deployment to Vercel

## Available Metrics

- `queryCount` - Number of queries executed
- `dataSize` - Amount of data processed by queries (in bytes)
- `queryDuration` - Average query execution time (in seconds)
- `errorRate` - Percentage of failed queries

## API Endpoints

### GET /api/metrics
Fetches data for all available metrics.

**Query Parameters:**
- `from` (optional): Start date in YYYY-MM-DD format (default: 7 days ago)
- `to` (optional): End date in YYYY-MM-DD format (default: today)

**Headers:**
- `X-API-Key`: Your API key

**Example Response:**
```json
{
  "queryCount": [
    { "date": "2023-03-20", "value": 750 },
    { "date": "2023-03-21", "value": 842 }
  ],
  "dataSize": [
    { "date": "2023-03-20", "value": 523145728 },
    { "date": "2023-03-21", "value": 612505600 }
  ],
  // other metrics...
}
```

### GET /api/metrics/:metricId
Fetches data for a specific metric.

**Path Parameters:**
- `metricId`: ID of the metric to fetch (e.g., "queryCount")

**Query Parameters:**
- `from` (optional): Start date in YYYY-MM-DD format
- `to` (optional): End date in YYYY-MM-DD format

**Headers:**
- `X-API-Key`: Your API key

**Example Response:**
```json
[
  { "date": "2023-03-20", "value": 750 },
  { "date": "2023-03-21", "value": 842 },
  { "date": "2023-03-22", "value": 901 }
]
```

## Setup and Deployment

### Prerequisites

- [Vercel account](https://vercel.com/signup)
- [Vercel CLI](https://vercel.com/cli)
- ClickHouse Cloud account with access credentials
- Node.js 18+

### Local Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Create a `.env` file with the following variables:
   ```
   CLICKHOUSE_HOST=your-instance.clickhouse.cloud
   CLICKHOUSE_PORT=8443
   CLICKHOUSE_USER=default
   CLICKHOUSE_PASSWORD=your_password
   CLICKHOUSE_DATABASE=default
   API_KEY=your_secret_api_key
   USE_MOCK_DATA=true
   ```
4. Run locally: `npm run dev`

### Deployment to Vercel

1. Install Vercel CLI if you haven't already: `npm install -g vercel`
2. Login to Vercel: `vercel login`
3. Deploy the project: `npm run deploy`
4. When prompted, set the following environment variables:
   - `CLICKHOUSE_HOST`
   - `CLICKHOUSE_USER`
   - `CLICKHOUSE_PASSWORD`
   - `API_KEY` (generate a secure random string)
5. Note the deployment URL for use in your dashboard frontend

### Environment Variables

- `CLICKHOUSE_HOST`: Hostname or URL of your ClickHouse Cloud instance (e.g., "your-instance.clickhouse.cloud")
- `CLICKHOUSE_PORT`: Port number for the ClickHouse connection (default: "8443")
- `CLICKHOUSE_USER`: ClickHouse username (default: "default")
- `CLICKHOUSE_PASSWORD`: ClickHouse password
- `CLICKHOUSE_DATABASE`: ClickHouse database name (default: "default")
- `API_KEY`: Secret key for API authentication
- `USE_MOCK_DATA`: Set to "true" to use mock data instead of querying ClickHouse (development only)

## Adding New Metrics

To add a new metric:

1. Add a new query in the `getQueryForMetric` function in `api/metrics.js`
2. Add the metric ID to the array in `fetchAllMetricsData`
3. Update the dashboard frontend to display the new metric

## License

MIT 
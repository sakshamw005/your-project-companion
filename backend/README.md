# Guardian Link Backend

Local Node.js backend server for the Guardian Link URL security scanner.

## Setup

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your API keys:
   ```
   VIRUSTOTAL_API_KEY=your_key_here
   ABUSEIPDB_API_KEY=your_key_here
   PORT=3001
   ```

5. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001`

## API Endpoints

### POST /api/scan
Scan a URL for security threats.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "url": "https://example.com",
  "timestamp": "2024-01-04T12:00:00.000Z",
  "phases": {
    "virusTotal": { "name": "VirusTotal Analysis", "score": 25, "maxScore": 25, "status": "safe" },
    "abuseIPDB": { "name": "AbuseIPDB Check", "score": 15, "maxScore": 15, "status": "safe" },
    ...
  },
  "totalScore": 85,
  "maxTotalScore": 100,
  "percentage": 85,
  "overallStatus": "safe"
}
```

### GET /api/health
Check server health status.

## Security Checks Performed

1. **VirusTotal Analysis** (25 pts) - Checks URL against 70+ security vendors
2. **AbuseIPDB Check** (15 pts) - Checks IP reputation for abuse reports
3. **SSL Certificate** (15 pts) - Validates HTTPS and certificate status
4. **Domain Analysis** (10 pts) - Checks for suspicious domain patterns
5. **Content Analysis** (15 pts) - Scans page content for phishing indicators
6. **Redirect Analysis** (10 pts) - Analyzes redirect chains
7. **Security Headers** (10 pts) - Checks for security headers implementation

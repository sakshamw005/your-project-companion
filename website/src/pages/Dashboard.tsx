import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldIcon } from '@/components/ShieldIcon';
import { AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react';

interface Scan {
  id: string;
  url: string;
  verdict: 'BLOCK' | 'WARN' | 'ALLOW';
  score: number;
  riskLevel: string;
  createdAt: string;
}

// Function to request extension registration
async function connectExtensionToAccount(token: string) {
  try {
    const response = await chrome.runtime?.sendMessage?.({
      action: 'registerExtension',
      userToken: token
    });

    if (response?.success) {
      return true;
    }
  } catch (error) {
    console.log('Extension not available');
  }
  return false;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExtensionPrompt, setShowExtensionPrompt] = useState(false);
  const [extensionConnecting, setExtensionConnecting] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const userEmail = localStorage.getItem('userEmail') || 'User';

  useEffect(() => {
    loadScans();
    checkExtensionInstalled();
    // Poll for new scans every 5 seconds
    const interval = setInterval(loadScans, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadScans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/scans', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          navigate('/login');
        }
        return;
      }

      const data = await response.json();
      setScans(data.scans || []);
    } catch (err) {
      setError('Failed to load scans');
    } finally {
      setLoading(false);
    }
  };

  const checkExtensionInstalled = () => {
    // Show prompt if no extension is linked yet
    const extensionToken = localStorage.getItem('extensionToken');
    setShowExtensionPrompt(!extensionToken);
  };

  const handleConnectExtension = async () => {
    setExtensionConnecting(true);
    const token = localStorage.getItem('token');
    const connected = await connectExtensionToAccount(token || '');
    
    if (connected) {
      setExtensionConnected(true);
      setShowExtensionPrompt(false);
      localStorage.setItem('extensionConnected', 'true');
    } else {
      alert('Please make sure the GuardianLink extension is installed and enabled. Then try again.');
    }
    setExtensionConnecting(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    navigate('/login');
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'BLOCK':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'WARN':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'ALLOW':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      default:
        return null;
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'BLOCK':
        return 'bg-red-100 text-red-800';
      case 'WARN':
        return 'bg-yellow-100 text-yellow-800';
      case 'ALLOW':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">GuardianLink Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{userEmail}</span>
            <Button variant="outline" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Extension Prompt */}
        {showExtensionPrompt && !extensionConnected && (
          <Alert className="mb-8 bg-indigo-50 border-indigo-200">
            <Zap className="h-4 w-4 text-indigo-600" />
            <AlertDescription className="text-indigo-800 ml-2">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <strong>⚡ Real-time Protection!</strong> Connect the GuardianLink browser extension to automatically scan URLs while you browse.
                </div>
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700" 
                  onClick={handleConnectExtension}
                  disabled={extensionConnecting}
                >
                  {extensionConnecting ? 'Connecting...' : 'Connect Extension'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {extensionConnected && (
          <Alert className="mb-8 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 ml-2">
              <strong>✓ Extension Connected!</strong> Your browser extension is now linked to your account and actively protecting you.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Scans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{scans.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Threats Blocked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {scans.filter(s => s.verdict === 'BLOCK').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {scans.filter(s => s.verdict === 'WARN').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scan History */}
        <Card>
          <CardHeader>
            <CardTitle>Scan History</CardTitle>
            <CardDescription>Recent URL scans from your browser extension and direct searches</CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading scans...</div>
            ) : scans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No scans yet. Start searching URLs or install the extension for real-time protection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Verdict</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((scan) => (
                      <TableRow key={scan.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {new URL(scan.url).hostname}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getVerdictIcon(scan.verdict)}
                            <Badge className={getVerdictColor(scan.verdict)}>
                              {scan.verdict}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            scan.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                            scan.riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            scan.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {scan.riskLevel}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                scan.score >= 70 ? 'bg-red-500' :
                                scan.score >= 40 ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${scan.score}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">{scan.score}</span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(scan.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

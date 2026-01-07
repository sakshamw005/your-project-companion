import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldIcon } from '@/components/ShieldIcon';

// Function to request extension registration
async function showExtensionConnectionPrompt(token: string) {
  // Check if extension is installed and listening
  try {
    const response = await chrome.runtime?.sendMessage?.({
      action: 'registerExtension',
      userToken: token
    });

    if (response?.success) {
      console.log('✅ Extension registered successfully');
      // Show success notification
      if (window.showNotification) {
        window.showNotification('✅ Extension connected to your account!');
      }
    }
  } catch (error) {
    // Extension not installed or messaging failed - that's okay
    console.log('ℹ️ Extension not available for registration');
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // Save token
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userEmail', email);

      // Show extension connection prompt
      showExtensionConnectionPrompt(data.token);

      navigate('/dashboard');
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-center mb-4">
            <ShieldIcon className="w-10 h-10 text-indigo-600" />
          </div>
          <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">Sign in to your GuardianLink account</CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')}
              className="text-indigo-600 hover:underline font-medium"
            >
              Sign up here
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

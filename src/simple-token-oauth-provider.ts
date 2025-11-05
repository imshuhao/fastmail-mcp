import { randomUUID } from 'node:crypto';

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  fastmailToken: string;
  expiresAt: number;
  scopes: string[];
}

interface TokenInfo {
  accountId: string;
  capabilities: Record<string, unknown>;
  validatedAt: number;
}

/**
 * Simple OAuth-like provider that accepts Fastmail API tokens through a web form.
 * Users paste their Fastmail API token in the authorization form, and it's returned
 * as an OAuth access token.
 */
export class SimpleTokenOAuthProvider {
  private authCodes = new Map<string, AuthorizationCode>();
  private tokenCache = new Map<string, TokenInfo>();
  private readonly baseUrl: string;
  private readonly fastmailBaseUrl: string;
  private readonly cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
  private readonly codeExpiryMs = 10 * 60 * 1000; // 10 minutes

  constructor(options: { baseUrl: string; fastmailBaseUrl?: string }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fastmailBaseUrl = (options.fastmailBaseUrl || 'https://api.fastmail.com').replace(/\/$/, '');
  }

  /**
   * Show authorization form where user can paste their Fastmail API token
   */
  async renderAuthorizationForm(params: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    code_challenge: string;
    code_challenge_method: string;
  }): Promise<string> {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = params;

    if (code_challenge_method && code_challenge_method !== 'S256' && code_challenge_method !== '') {
      throw new Error('Only S256 code challenge method is supported');
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fastmail MCP Authorization</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-top: 0;
    }
    label {
      display: block;
      margin-top: 20px;
      margin-bottom: 8px;
      font-weight: 600;
      color: #555;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
      font-family: 'Courier New', monospace;
    }
    button {
      margin-top: 20px;
      padding: 12px 24px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
    }
    button:hover {
      background: #0052a3;
    }
    .instructions {
      background: #f9f9f9;
      padding: 15px;
      border-left: 4px solid #0066cc;
      margin-bottom: 20px;
      font-size: 14px;
      line-height: 1.6;
    }
    .instructions ol {
      margin: 10px 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Fastmail MCP Authorization</h1>

    <div class="instructions">
      <strong>How to get your Fastmail API token:</strong>
      <ol>
        <li>Log into Fastmail</li>
        <li>Go to Settings → Privacy &amp; Security</li>
        <li>Navigate to "Connected apps &amp; API tokens"</li>
        <li>Create a new API token with appropriate permissions</li>
        <li>Copy the token and paste it below</li>
      </ol>
    </div>

    <form method="POST" action="/authorize/submit">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
      <input type="hidden" name="state" value="${escapeHtml(state || '')}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method)}">

      <label for="token">Fastmail API Token:</label>
      <input
        type="password"
        id="token"
        name="token"
        required
        placeholder="Enter your Fastmail API token"
        autocomplete="off"
      >

      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>
    `;
  }

  /**
   * Handle form submission, validate token, generate auth code
   */
  async handleAuthorizationSubmit(formData: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    code_challenge: string;
    code_challenge_method: string;
    token: string;
  }): Promise<{ redirectUrl: string; error?: string }> {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, token } = formData;

    // Validate token against Fastmail
    try {
      const tokenInfo = await this.validateFastmailToken(token);

      // Generate authorization code
      const code = randomUUID();
      const authCode: AuthorizationCode = {
        code,
        clientId: client_id,
        redirectUri: redirect_uri,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        fastmailToken: token,
        expiresAt: Date.now() + this.codeExpiryMs,
        scopes: ['email', 'contacts', 'calendar']
      };

      this.authCodes.set(code, authCode);

      // Cache token validation
      this.tokenCache.set(token, tokenInfo);

      // Build redirect URL with code
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }

      return { redirectUrl: redirectUrl.toString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token validation failed';
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('error', 'invalid_token');
      redirectUrl.searchParams.set('error_description', message);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      return { redirectUrl: redirectUrl.toString(), error: message };
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeAuthorizationCode(params: {
    client_id: string;
    code: string;
    code_verifier: string;
  }): Promise<{
    access_token: string;
    token_type: 'bearer';
    expires_in?: number;
    scope?: string;
  }> {
    const { code, code_verifier, client_id } = params;

    const authCode = this.authCodes.get(code);
    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    // Check expiration
    if (Date.now() > authCode.expiresAt) {
      this.authCodes.delete(code);
      throw new Error('Authorization code expired');
    }

    // Verify PKCE challenge (only if code_challenge was provided)
    if (authCode.codeChallenge && code_verifier) {
      const crypto = await import('node:crypto');
      const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
      if (hash !== authCode.codeChallenge) {
        throw new Error('Invalid code verifier');
      }
    }

    // Verify client
    if (authCode.clientId !== client_id) {
      throw new Error('Client mismatch');
    }

    // Clean up authorization code (one-time use)
    this.authCodes.delete(code);

    // Return the Fastmail token as the access token
    return {
      access_token: authCode.fastmailToken,
      token_type: 'bearer',
      scope: authCode.scopes.join(' ')
    };
  }

  /**
   * Verify access token by checking against Fastmail
   */
  async verifyAccessToken(token: string): Promise<TokenInfo> {
    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && Date.now() - cached.validatedAt < this.cacheExpiryMs) {
      return cached;
    }

    // Validate against Fastmail
    const tokenInfo = await this.validateFastmailToken(token);

    // Update cache
    this.tokenCache.set(token, tokenInfo);

    return tokenInfo;
  }

  /**
   * Validate token by calling Fastmail session endpoint
   */
  private async validateFastmailToken(token: string): Promise<TokenInfo> {
    if (!token || token.trim().length === 0) {
      throw new Error('Token is required');
    }

    const sessionUrl = `${this.fastmailBaseUrl}/jmap/session`;

    try {
      const response = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Fastmail API token. Please check that your token is correct and has not expired.');
        }
        if (response.status === 403) {
          throw new Error('Fastmail API token does not have sufficient permissions.');
        }
        const errorText = await response.text().catch(() => '');
        throw new Error(`Fastmail API error: ${response.status} ${response.statusText}${errorText ? ': ' + errorText : ''}`);
      }

      const session = await response.json() as { accounts: Record<string, unknown>; capabilities: Record<string, unknown> };

      if (!session.accounts || Object.keys(session.accounts).length === 0) {
        throw new Error('No accounts found in Fastmail session. Please check your API token.');
      }

      const accountId = Object.keys(session.accounts)[0];

      return {
        accountId,
        capabilities: session.capabilities || {},
        validatedAt: Date.now()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to validate Fastmail token: ${String(error)}`);
    }
  }

  /**
   * Revoke token (clear from cache)
   */
  async revokeToken(token: string): Promise<void> {
    this.tokenCache.delete(token);
  }

  /**
   * RFC 7591 Dynamic Client Registration (fake implementation)
   * Accepts any client registration and returns a successful response
   */
  async registerClient(metadata: {
    redirect_uris?: string[];
    token_endpoint_auth_method?: string;
    grant_types?: string[];
    response_types?: string[];
    client_name?: string;
    client_uri?: string;
    logo_uri?: string;
    scope?: string;
    contacts?: string[];
    tos_uri?: string;
    policy_uri?: string;
    jwks_uri?: string;
    jwks?: unknown;
    software_id?: string;
    software_version?: string;
  }) {
    // Generate a fake client_id (no actual storage or validation)
    const clientId = `fake-client-${randomUUID()}`;

    // Return RFC 7591 compliant response
    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: metadata.redirect_uris || [],
      token_endpoint_auth_method: metadata.token_endpoint_auth_method || 'none',
      grant_types: metadata.grant_types || ['authorization_code'],
      response_types: metadata.response_types || ['code'],
      client_name: metadata.client_name || 'Unnamed Client',
      scope: metadata.scope || 'email contacts calendar'
    };
  }

  /**
   * Get authorization server metadata
   */
  getAuthorizationServerMetadata() {
    return {
      issuer: this.baseUrl,
      authorization_endpoint: `${this.baseUrl}/authorize`,
      token_endpoint: `${this.baseUrl}/token`,
      revocation_endpoint: `${this.baseUrl}/revoke`,
      registration_endpoint: `${this.baseUrl}/register`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code'],
      response_types_supported: ['code'],
      scopes_supported: ['email', 'contacts', 'calendar'],
      token_endpoint_auth_methods_supported: ['none']
    };
  }

  /**
   * Cleanup expired codes periodically
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [code, authCode] of this.authCodes.entries()) {
        if (now > authCode.expiresAt) {
          this.authCodes.delete(code);
        }
      }
    }, 60000); // Every minute
  }
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

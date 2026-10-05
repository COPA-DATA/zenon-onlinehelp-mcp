@description('Name of the Front Door profile')
param profileName string

@description('Name of the Front Door endpoint')
param endpointName string

@description('Name of the WAF policy (alphanumeric only)')
param wafPolicyName string

@description('Tags that will be applied to all resources')
param tags object = {}

@description('Host name of the origin (the Container App FQDN)')
param originHostName string

@description('WAF mode')
@allowed([
  'Prevention'
  'Detection'
])
param wafMode string = 'Prevention'

@description('Maximum requests per client IP per minute before the WAF blocks')
param rateLimitPerMinute int = 300

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: profileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
  properties: {
    // Playwright-backed topic fetches can exceed the 60s default.
    originResponseTimeoutSeconds: 120
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: endpointName
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'mcp-origins'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    // Health probes are omitted: there is a single origin, and probes would be
    // rejected by the app's X-Azure-FDID check anyway.
    sessionAffinityState: 'Disabled'
  }
}

resource origin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: 'container-app'
  properties: {
    hostName: originHostName
    originHostHeader: originHostName
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'mcp-route'
  properties: {
    originGroup: {
      id: originGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    enabledState: 'Enabled'
    // No cacheConfiguration: caching and compression stay off so SSE responses stream through.
  }
  dependsOn: [
    origin
  ]
}

resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: wafPolicyName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: wafMode
    }
    // Managed rule sets require the Premium tier; Standard supports custom rules only.
    customRules: {
      rules: [
        {
          name: 'RateLimitPerClientIp'
          priority: 100
          enabledState: 'Enabled'
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: rateLimitPerMinute
          groupBy: [
            {
              variableName: 'SocketAddr'
            }
          ]
          matchConditions: [
            {
              matchVariable: 'RemoteAddr'
              operator: 'IPMatch'
              negateCondition: false
              matchValue: [
                '0.0.0.0/0'
                '::/0'
              ]
            }
          ]
          action: 'Block'
        }
      ]
    }
  }
}

resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = {
  parent: profile
  name: 'waf'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: endpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

output frontDoorId string = profile.properties.frontDoorId
output endpointHostName string = endpoint.properties.hostName

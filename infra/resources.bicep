@description('The location used for all deployed resources')
param location string = resourceGroup().location

@description('Tags that will be applied to all resources')
param tags object = {}


param zenonDocsMcpExists bool

param copatoolsDocsMcpExists bool

@description('Base URL of the copatools API used by the copatools-docs-mcp server')
param copatoolsApiBaseUrl string

@description('Id of the user or app to assign application roles')
param principalId string

@description('Principal type of user or app')
param principalType string

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = uniqueString(subscription().id, resourceGroup().id, location)

// Monitor application with Azure Monitor
module monitoring 'br/public:avm/ptn/azd/monitoring:0.1.0' = {
  name: 'monitoring'
  params: {
    logAnalyticsName: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    applicationInsightsName: '${abbrs.insightsComponents}${resourceToken}'
    applicationInsightsDashboardName: '${abbrs.portalDashboards}${resourceToken}'
    location: location
    tags: tags
  }
}
// Container registry
module containerRegistry 'br/public:avm/res/container-registry/registry:0.1.1' = {
  name: 'registry'
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
    publicNetworkAccess: 'Enabled'
    roleAssignments:[
      {
        principalId: zenonDocsMcpIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
      }
    ]
  }
}

// Container apps environment
module containerAppsEnvironment 'br/public:avm/res/app/managed-environment:0.4.5' = {
  name: 'container-apps-environment'
  params: {
    logAnalyticsWorkspaceResourceId: monitoring.outputs.logAnalyticsWorkspaceResourceId
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    zoneRedundant: false
  }
}

// The Container Apps' FQDNs are deterministic, so Front Door can be deployed before the
// apps themselves and hand its profile ID to their FRONT_DOOR_ID env var without a cycle.
var zenonDocsMcpFqdn = 'zenon-docs-mcp.${containerAppsEnvironment.outputs.defaultDomain}'
var copatoolsDocsMcpFqdn = 'copatools-docs-mcp.${containerAppsEnvironment.outputs.defaultDomain}'

// Azure Front Door (Standard) with a rate-limiting WAF policy in front of the Container Apps,
// one endpoint per MCP server. The zenon entry keeps its original child names so existing
// deployments are updated in place.
module frontDoor './modules/front-door.bicep' = {
  name: 'front-door'
  params: {
    profileName: '${abbrs.cdnProfiles}${resourceToken}'
    wafPolicyName: replace('${abbrs.networkFrontdoorWebApplicationFirewallPolicies}${resourceToken}', '-', '')
    endpoints: [
      {
        endpointName: '${abbrs.cdnProfilesEndpoints}${resourceToken}'
        originGroupName: 'mcp-origins'
        originName: 'container-app'
        routeName: 'mcp-route'
        originHostName: zenonDocsMcpFqdn
      }
      {
        endpointName: '${abbrs.cdnProfilesEndpoints}copatools-${resourceToken}'
        originGroupName: 'copatools-origins'
        originName: 'copatools-app'
        routeName: 'copatools-route'
        originHostName: copatoolsDocsMcpFqdn
      }
    ]
    tags: tags
  }
}

module zenonDocsMcpIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.2.1' = {
  name: 'zenonDocsMcpidentity'
  params: {
    name: '${abbrs.managedIdentityUserAssignedIdentities}zenonDocsMcp-${resourceToken}'
    location: location
  }
}
module zenonDocsMcpFetchLatestImage './modules/fetch-container-image.bicep' = {
  name: 'zenonDocsMcp-fetch-image'
  params: {
    exists: zenonDocsMcpExists
    name: 'zenon-docs-mcp'
  }
}

module zenonDocsMcp 'br/public:avm/res/app/container-app:0.8.0' = {
  name: 'zenonDocsMcp'
  params: {
    name: 'zenon-docs-mcp'
    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'auto'
    scaleMinReplicas: 1
    scaleMaxReplicas: 3
    secrets: {
      secureList:  [
      ]
    }
    containers: [
      {
        image: zenonDocsMcpFetchLatestImage.outputs.?containers[?0].?image ?? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
        name: 'main'
        // Override the image's default CMD (dist/index.js, stdio mode) to run the HTTP
        // transport instead; ENTRYPOINT ["node"] is preserved since `command` is unset.
        args: [
          'dist/http.js'
        ]
        resources: {
          // Playwright/Chromium needs real headroom - see README; minimum sizing times out.
          cpu: json('1.0')
          memory: '2.0Gi'
        }
        env: [
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: monitoring.outputs.applicationInsightsConnectionString
          }
          {
            name: 'AZURE_CLIENT_ID'
            value: zenonDocsMcpIdentity.outputs.clientId
          }
          {
            name: 'PORT'
            value: '3000'
          }
          {
            name: 'HOST'
            value: '0.0.0.0'
          }
          {
            // Requests without this profile's X-Azure-FDID header are rejected (403),
            // so the direct *.azurecontainerapps.io URL can't bypass Front Door.
            name: 'FRONT_DOOR_ID'
            value: frontDoor.outputs.frontDoorId
          }
          {
            // Front Door forwards the origin FQDN as Host; validating it restores the
            // DNS-rebinding protection that HOST=0.0.0.0 otherwise disables.
            name: 'ALLOWED_HOSTS'
            value: zenonDocsMcpFqdn
          }
          // The docs.copatools.com source runs as its own app: see copatoolsDocsMcp below.
        ]
      }
    ]
    managedIdentities:{
      systemAssigned: false
      userAssignedResourceIds: [zenonDocsMcpIdentity.outputs.resourceId]
    }
    registries:[
      {
        server: containerRegistry.outputs.loginServer
        identity: zenonDocsMcpIdentity.outputs.resourceId
      }
    ]
    environmentResourceId: containerAppsEnvironment.outputs.resourceId
    location: location
    tags: union(tags, { 'azd-service-name': 'zenon-docs-mcp' })
  }
}
// Second MCP server: same image, configured for the docs.copatools.com REST API source.
module copatoolsDocsMcpFetchLatestImage './modules/fetch-container-image.bicep' = {
  name: 'copatoolsDocsMcp-fetch-image'
  params: {
    exists: copatoolsDocsMcpExists
    name: 'copatools-docs-mcp'
  }
}

module copatoolsDocsMcp 'br/public:avm/res/app/container-app:0.8.0' = {
  name: 'copatoolsDocsMcp'
  params: {
    name: 'copatools-docs-mcp'
    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'auto'
    scaleMinReplicas: 1
    scaleMaxReplicas: 3
    secrets: {
      secureList:  [
      ]
    }
    containers: [
      {
        image: copatoolsDocsMcpFetchLatestImage.outputs.?containers[?0].?image ?? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
        name: 'main'
        args: [
          'dist/http.js'
        ]
        resources: {
          // No headless browser for this source, so a smaller size is enough.
          cpu: json('0.5')
          memory: '1.0Gi'
        }
        env: [
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: monitoring.outputs.applicationInsightsConnectionString
          }
          {
            name: 'AZURE_CLIENT_ID'
            value: zenonDocsMcpIdentity.outputs.clientId
          }
          {
            name: 'PORT'
            value: '3000'
          }
          {
            name: 'HOST'
            value: '0.0.0.0'
          }
          {
            name: 'FRONT_DOOR_ID'
            value: frontDoor.outputs.frontDoorId
          }
          {
            name: 'ALLOWED_HOSTS'
            value: copatoolsDocsMcpFqdn
          }
          {
            name: 'DOC_SOURCE'
            value: 'copatools'
          }
          {
            name: 'COPATOOLS_API_BASE_URL'
            value: copatoolsApiBaseUrl
          }
        ]
      }
    ]
    managedIdentities:{
      systemAssigned: false
      userAssignedResourceIds: [zenonDocsMcpIdentity.outputs.resourceId]
    }
    registries:[
      {
        server: containerRegistry.outputs.loginServer
        identity: zenonDocsMcpIdentity.outputs.resourceId
      }
    ]
    environmentResourceId: containerAppsEnvironment.outputs.resourceId
    location: location
    tags: union(tags, { 'azd-service-name': 'copatools-docs-mcp' })
  }
}
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistry.outputs.loginServer
output AZURE_RESOURCE_ZENON_DOCS_MCP_ID string = zenonDocsMcp.outputs.resourceId
output AZURE_RESOURCE_COPATOOLS_DOCS_MCP_ID string = copatoolsDocsMcp.outputs.resourceId
output AZURE_FRONT_DOOR_ENDPOINT string = 'https://${frontDoor.outputs.endpointHostNames[0]}/mcp'
output AZURE_FRONT_DOOR_COPATOOLS_ENDPOINT string = 'https://${frontDoor.outputs.endpointHostNames[1]}/mcp'

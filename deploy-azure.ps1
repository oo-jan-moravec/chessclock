#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy the Chess Clock static site to Azure Storage static website hosting.

.DESCRIPTION
    Creates (or reuses) a resource group and StorageV2 account, enables the
    static website feature, and uploads the local files to the $web container.

.PARAMETER ResourceGroup
    Azure Resource Group name (default: rg-chessclock)

.PARAMETER Location
    Azure region for new resources (default: germanywestcentral)

.PARAMETER StorageAccountName
    Globally unique Storage Account name (3-24 lower-case letters/numbers)

.PARAMETER SourcePath
    Local folder to upload. Defaults to the repository root.

.PARAMETER IndexDocument
    Entry file for the static website (default: index.html)

.PARAMETER ErrorDocument
    404/error file (default: index.html)

.PARAMETER SkipResourceCreation
    Skip creating resource group / storage account, only upload.

.PARAMETER SkipUpload
    Skip uploading files (only create resources).

.EXAMPLE
    ./deploy-azure.ps1 -StorageAccountName chessclockdemo123

.EXAMPLE
    ./deploy-azure.ps1 -StorageAccountName chessclockdemo123 `
        -ResourceGroup rg-chessclock-prod -Location westeurope
#>

param(
    [string]$ResourceGroup = "rg-chessclock",
    [string]$Location = "germanywestcentral",
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-z0-9]{3,24}$")]
    [string]$StorageAccountName,
    [string]$SourcePath = ".",
    [string]$IndexDocument = "index.html",
    [string]$ErrorDocument = "index.html",
    [switch]$SkipResourceCreation,
    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$fullSourcePath = Resolve-Path -Path (Join-Path $scriptRoot $SourcePath)

if (-not (Test-Path (Join-Path $fullSourcePath $IndexDocument))) {
    Write-Host "ERROR: Could not find $IndexDocument in $fullSourcePath" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Chess Clock - Azure Static Web Deploy" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

try { $null = az --version }
catch {
    Write-Host "Azure CLI is not installed. Install from https://aka.ms/installazurecli" -ForegroundColor Red
    exit 1
}

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Logging in to Azure..." -ForegroundColor Yellow
    az login > $null
    $account = az account show | ConvertFrom-Json
}

Write-Host "Using subscription: $($account.name) [$($account.id)]" -ForegroundColor Green
Write-Host ""

if (-not $SkipResourceCreation) {
    Write-Host "Ensuring Resource Group '$ResourceGroup'..." -ForegroundColor Yellow
    $rg = az group show --name $ResourceGroup 2>$null | ConvertFrom-Json
    if ($rg) {
        $Location = $rg.location
        Write-Host "  Found existing group in $Location" -ForegroundColor Green
    }
    else {
        az group create --name $ResourceGroup --location $Location --output none
        Write-Host "  Resource Group created." -ForegroundColor Green
    }

    Write-Host "Ensuring Storage Account '$StorageAccountName'..." -ForegroundColor Yellow
    $acct = az storage account show `
        --name $StorageAccountName `
        --resource-group $ResourceGroup 2>$null | ConvertFrom-Json

    if (-not $acct) {
        az storage account create `
            --name $StorageAccountName `
            --resource-group $ResourceGroup `
            --location $Location `
            --sku Standard_LRS `
            --kind StorageV2 `
            --access-tier Hot `
            --output none
        Write-Host "  Storage Account created." -ForegroundColor Green
    }
    else {
        Write-Host "  Storage Account already exists." -ForegroundColor Green
    }
}

Write-Host "Enabling static website hosting..." -ForegroundColor Yellow
az storage blob service-properties update `
    --account-name $StorageAccountName `
    --resource-group $ResourceGroup `
    --static-website `
    --index-document $IndexDocument `
    --404-document $ErrorDocument `
    --output none
Write-Host "  Static website configured." -ForegroundColor Green

$connectionString = az storage account show-connection-string `
    --name $StorageAccountName `
    --resource-group $ResourceGroup `
    --query connectionString `
    --output tsv

if (-not $SkipUpload) {
    Write-Host ""
    Write-Host "Uploading site from $fullSourcePath ..." -ForegroundColor Yellow

    Write-Host "  Clearing existing files..." -ForegroundColor Gray
    az storage blob delete-batch `
        --connection-string $connectionString `
        --source '$web' `
        --pattern "*" `
        --no-progress `
        --output none 2>$null

    az storage blob upload-batch `
        --connection-string $connectionString `
        --destination '$web' `
        --source $fullSourcePath `
        --no-progress `
        --overwrite `
        --output none

    Write-Host "  Upload complete." -ForegroundColor Green
}
else {
    Write-Host "SkipUpload flag set - no files uploaded." -ForegroundColor Yellow
}

$endpoint = az storage account show `
    --name $StorageAccountName `
    --resource-group $ResourceGroup `
    --query "primaryEndpoints.web" `
    --output tsv

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Deployment Complete" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Static site available at:" -ForegroundColor Green
Write-Host "  $endpoint" -ForegroundColor White
Write-Host ""
Write-Host "Tip: add a CDN/front door for custom domains + HTTPS if needed." -ForegroundColor Gray

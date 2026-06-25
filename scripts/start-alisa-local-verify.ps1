# 使用艾莉莎全量训练导出的本地数据启动服务，便于在浏览器里验证
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $repo 'data\alisa-training-local'

if (-not (Test-Path $dataDir)) {
  Write-Error "未找到训练数据目录: $dataDir`n请先运行 npm run train:alisa 或从报告中的 data_dir 复制到该路径。"
}

$env:DATA_DIR = $dataDir
$env:QUESTION_BANK_PATH = Join-Path (Split-Path $repo -Parent) '题库.txt'
$env:PORT = if ($env:PORT) { $env:PORT } else { '3024' }

Write-Host '[数字方舟] 本地验证模式'
Write-Host "  DATA_DIR=$dataDir"
Write-Host "  题库=$env:QUESTION_BANK_PATH"
Write-Host "  打开 http://127.0.0.1:$($env:PORT) 进行验证"
Write-Host ''

Set-Location $repo
node server.js

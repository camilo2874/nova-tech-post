# Abre cajon monedero via impresora termica (ESC/POS)
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File abrir-cajon.ps1 -PrinterName "Generic / Text Only (Copiar 1)"

param(
    [string]$PrinterName = $null,
    [int]$Pin = 0,
    [int]$OnMs = 50,
    [int]$OffMs = 250
)

$ErrorActionPreference = "Stop"

function Get-DrawerKickCommand {
    param([int]$Pin = 0, [int]$OnMs = 50, [int]$OffMs = 250)
  # ESC p m t1 t2 — m=0 pin 2, m=1 pin 5
    return [byte[]](0x1B, 0x70, $Pin, $OnMs, $OffMs)
}

function Get-PrinterList {
    try {
        return @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    } catch {
        return @()
    }
}

function Find-ReceiptPrinter {
    $printers = Get-PrinterList
    if ($printers.Count -eq 0) { return $null }

    $patterns = @("*Epson*", "*TM-T*", "*termica*", "*térmica*", "*Generic / Text Only*")
    foreach ($pattern in $patterns) {
        $match = $printers | Where-Object { $_ -like $pattern } | Select-Object -First 1
        if ($match) { return $match }
    }

    # Impresora USB que no sea PDF, OneNote ni HP de oficina
    $skip = @("*PDF*", "*OneNote*", "*Smart Tank*", "*Fax*")
    foreach ($name in $printers) {
        $skipIt = $false
        foreach ($s in $skip) {
            if ($name -like $s) { $skipIt = $true; break }
        }
        if (-not $skipIt) {
            $p = Get-Printer -Name $name -ErrorAction SilentlyContinue
            if ($p -and $p.PortName -like "USB*") { return $name }
        }
    }

    return $null
}

function Send-RawToPrinter {
    param(
        [string]$PrinterName,
        [byte[]]$Bytes
    )

    if ([string]::IsNullOrWhiteSpace($PrinterName)) {
        Write-Error "Nombre de impresora vacio"
        return $false
    }

    $printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
    if (-not $printer) {
        Write-Error "Impresora no encontrada: $PrinterName"
        return $false
    }

    $rawPrinterCode = @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            return false;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "CajonMonedero";
        di.pDataType = "RAW";

        bool ok = false;
        if (StartDocPrinter(hPrinter, 1, di))
        {
            if (StartPagePrinter(hPrinter))
            {
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                int dwWritten;
                ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
            }
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        return ok;
    }
}
'@

    try {
        if (-not ("RawPrinterHelper" -as [type])) {
            Add-Type -TypeDefinition $rawPrinterCode -Language CSharp
        }

        $ok = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $Bytes)
        if ($ok) {
            Write-Host "OK: Cajon abierto en impresora: $PrinterName (puerto: $($printer.PortName))"
            return $true
        }

        Write-Error "WritePrinter fallo para: $PrinterName"
        return $false
    } catch {
        Write-Error "Error enviando RAW: $_"
        return $false
    }
}

function Open-CashDrawer {
    param([string]$PrinterName, [int]$Pin, [int]$OnMs, [int]$OffMs)

    Write-Host "=== Cajon monedero - NOVA TECH ==="

    if ([string]::IsNullOrWhiteSpace($PrinterName)) {
        Write-Host "Buscando impresora termica..."
        $PrinterName = Find-ReceiptPrinter

        if (-not $PrinterName) {
            Write-Host "Impresoras disponibles:"
            Get-PrinterList | ForEach-Object { Write-Host "  - $_" }
            Write-Error "No se encontro impresora termica. Usa -PrinterName 'Nombre exacto'"
            exit 1
        }
    }

    Write-Host "Impresora: $PrinterName"
    Write-Host "Pin ESC/POS m=$Pin, ON=${OnMs}ms, OFF=${OffMs}ms"

    $command = Get-DrawerKickCommand -Pin $Pin -OnMs $OnMs -OffMs $OffMs
    $hex = ($command | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
    Write-Host "Comando: $hex"

    $result = Send-RawToPrinter -PrinterName $PrinterName -Bytes $command

    if ($result) {
        exit 0
    } else {
        exit 1
    }
}

Open-CashDrawer -PrinterName $PrinterName -Pin $Pin -OnMs $OnMs -OffMs $OffMs

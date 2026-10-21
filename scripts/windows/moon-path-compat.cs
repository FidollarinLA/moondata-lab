using System;
using System.Diagnostics;
using System.IO;
using System.Text;
// Local proxy for the pinned Windows compiler tools; never changes their output.
class Compat {
    // Windows argv quoting: backslashes before quotes and at the end are doubled.
    static string Quote(string argument) {
        var quoted = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in argument) {
            if (c == '\\') { slashes++; continue; }
            quoted.Append('\\', c == '\"' ? 2 * slashes + 1 : slashes).Append(c);
            slashes = 0;
        }
        return quoted.Append('\\', 2 * slashes).Append('\"').ToString();
    }
    static int Main(string[] args) {
        var name = Path.GetFileName(Process.GetCurrentProcess().MainModule.FileName);
        var bin = Environment.GetEnvironmentVariable("MOON_COMPAT_BIN");
        if (String.IsNullOrEmpty(bin)) { Console.Error.WriteLine("MOON_COMPAT_BIN is required."); return 2; }
        var commandLine = new StringBuilder();
        foreach (var argument in args)
            commandLine.Append(Quote(argument.Replace(@"\\?\UNC\", @"\\").Replace(@"\\?\", ""))).Append(' ');
        using (var child = new Process()) {
            child.StartInfo = new ProcessStartInfo(Path.Combine(bin, name), commandLine.ToString()) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            child.OutputDataReceived += (s, e) => { if (e.Data != null) Console.Out.WriteLine(e.Data); };
            child.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
            child.Start(); child.BeginOutputReadLine(); child.BeginErrorReadLine(); child.WaitForExit();
            return child.ExitCode;
        }
    }
}

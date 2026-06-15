package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	waLog "go.mau.fi/whatsmeow/util/log"
)

// DailyFileWriter is a thread-safe io.WriteCloser that automatically rotates
// files daily based on the local system time.
type DailyFileWriter struct {
	dir         string
	baseName    string
	currentFile *os.File
	currentDate string
	mu          sync.Mutex
}

// NewDailyFileWriter creates a new DailyFileWriter.
func NewDailyFileWriter(dir, baseName string) *DailyFileWriter {
	return &DailyFileWriter{
		dir:      dir,
		baseName: baseName,
	}
}

// Write writes data to the active daily file.
func (d *DailyFileWriter) Write(p []byte) (n int, err error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	today := time.Now().Format("2006-01-02")
	if d.currentFile == nil || d.currentDate != today {
		if d.currentFile != nil {
			d.currentFile.Sync()
			d.currentFile.Close()
		}

		// Ensure directory exists
		if err = os.MkdirAll(d.dir, os.ModePerm); err != nil {
			return 0, fmt.Errorf("failed to create log directory %s: %w", d.dir, err)
		}

		// Filename pattern: baseName-YYYY-MM-DD.txt (e.g. app-2026-06-10.txt)
		filename := fmt.Sprintf("%s-%s.txt", d.baseName, today)
		filePath := filepath.Join(d.dir, filename)

		file, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			return 0, fmt.Errorf("failed to open log file %s: %w", filePath, err)
		}

		d.currentFile = file
		d.currentDate = today
	}

	return d.currentFile.Write(p)
}

// Close closes the current log file.
func (d *DailyFileWriter) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.currentFile != nil {
		err := d.currentFile.Close()
		d.currentFile = nil
		return err
	}
	return nil
}

var (
	dailyWriter *DailyFileWriter
	MultiWriter io.Writer
)

// InitLogger initializes logging to both console and daily rotated files.
// It returns the multi-writer and a cleanup function to close the writer.
func InitLogger(logDir, baseName string) (io.Writer, func()) {
	dailyWriter = NewDailyFileWriter(logDir, baseName)
	MultiWriter = io.MultiWriter(os.Stdout, dailyWriter)

	// Set standard logger output to the multi-writer
	log.SetOutput(MultiWriter)
	// Set log flags to show date, microsecond time, and short file path
	log.SetFlags(log.LstdFlags | log.Lshortfile | log.Lmicroseconds)

	cleanup := func() {
		if dailyWriter != nil {
			dailyWriter.Close()
		}
	}

	return MultiWriter, cleanup
}

// WhatsMeowLogger implements go.mau.fi/whatsmeow/util/log.Logger
type WhatsMeowLogger struct {
	module   string
	writer   io.Writer
	minLevel int
}

var levelMap = map[string]int{
	"DEBUG": 0,
	"INFO":  1,
	"WARN":  2,
	"ERROR": 3,
}

// NewWhatsMeowLogger creates a new logger adapter for whatsmeow
func NewWhatsMeowLogger(module string, writer io.Writer, minLevelStr string) *WhatsMeowLogger {
	minLevel, ok := levelMap[minLevelStr]
	if !ok {
		minLevel = 2 // Default to WARN
	}
	return &WhatsMeowLogger{
		module:   module,
		writer:   writer,
		minLevel: minLevel,
	}
}

func (w *WhatsMeowLogger) log(level string, format string, args ...interface{}) {
	lvl, ok := levelMap[level]
	if !ok || lvl < w.minLevel {
		return
	}
	timeStr := time.Now().Format("2006-01-02 15:04:05.000000")
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(w.writer, "%s [Whatsmeow/%s] [%s] %s\n", timeStr, w.module, level, msg)
}

func (w *WhatsMeowLogger) Debug(format string, args ...interface{}) {
	w.log("DEBUG", format, args...)
}

func (w *WhatsMeowLogger) Info(format string, args ...interface{}) {
	w.log("INFO", format, args...)
}

func (w *WhatsMeowLogger) Warn(format string, args ...interface{}) {
	w.log("WARN", format, args...)
}

func (w *WhatsMeowLogger) Error(format string, args ...interface{}) {
	w.log("ERROR", format, args...)
}

func (w *WhatsMeowLogger) Debugf(format string, args ...interface{}) {
	w.log("DEBUG", format, args...)
}

func (w *WhatsMeowLogger) Infof(format string, args ...interface{}) {
	w.log("INFO", format, args...)
}

func (w *WhatsMeowLogger) Warnf(format string, args ...interface{}) {
	w.log("WARN", format, args...)
}

func (w *WhatsMeowLogger) Errorf(format string, args ...interface{}) {
	w.log("ERROR", format, args...)
}

func (w *WhatsMeowLogger) Sub(module string) waLog.Logger {
	var minLevelStr = "WARN"
	for k, v := range levelMap {
		if v == w.minLevel {
			minLevelStr = k
			break
		}
	}
	return NewWhatsMeowLogger(w.module+"/"+module, w.writer, minLevelStr)
}


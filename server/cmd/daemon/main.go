package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := log.New(os.Stdout, "multica-daemon: ", log.LstdFlags)
	d := newDaemon(cfg, logger)

	if err := d.run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Fatal(err)
	}
}

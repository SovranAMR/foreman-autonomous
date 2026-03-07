# Fıtrat AI v2 — Makefile
CC       = gcc
CFLAGS   = -std=c99 -O2 -march=native -Wall -Wextra -Wno-unused-parameter \
           -D_POSIX_C_SOURCE=199309L
LDFLAGS  = -lm -lpthread

SRC_DIR   = src
BUILD_DIR = build

# CPU-only sources (no Vulkan)
SRCS = $(SRC_DIR)/main.c \
       $(SRC_DIR)/tick.c \
       \
       $(SRC_DIR)/hash.c \
       $(SRC_DIR)/grid.c \
       $(SRC_DIR)/learning.c \
       $(SRC_DIR)/homeostasis.c \
       $(SRC_DIR)/neuromod.c \
       $(SRC_DIR)/sleep.c \
       $(SRC_DIR)/evolution.c \
       $(SRC_DIR)/io.c \
       $(SRC_DIR)/checkpoint.c \
       $(SRC_DIR)/poisson.c \
       $(SRC_DIR)/synapse_table.c

OBJS = $(patsubst %.c,$(BUILD_DIR)/%.o,$(notdir $(SRCS)))

TARGET = fitrat2

.PHONY: all clean

all: dirs $(TARGET)

dirs:
	@mkdir -p $(BUILD_DIR)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	$(CC) $(CFLAGS) -I$(SRC_DIR) -c -o $@ $<

clean:
	rm -rf $(BUILD_DIR) $(TARGET)

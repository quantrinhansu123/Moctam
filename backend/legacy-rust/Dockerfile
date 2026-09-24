# Stage 1: Build the Rust application
FROM rust:latest AS builder
WORKDIR /app

# Copy dependency manifests
COPY Cargo.toml Cargo.lock ./

# (Optional) If you have a src folder with a dummy main to cache dependencies,
# you can copy source files next:
COPY src ./src

# Build for release
RUN cargo build --release

# Stage 2: Runtime image
FROM debian:bookworm-slim
WORKDIR /app

# Install necessary runtime dependencies (like SSL certificates if connecting to MongoDB Atlas)
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
# Replace 'your_binary_name' with the name defined in your Cargo.toml package.name
COPY --from=builder /app/target/release/backend /usr/local/bin/

# Expose the port the app runs on
EXPOSE 8080

# Run the binary
CMD ["backend"]

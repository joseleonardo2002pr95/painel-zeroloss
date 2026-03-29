FROM python:3.11-slim

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy all project files
COPY . .

# Build the frontend
RUN cd frontend && npm install && npm run build

# Install Python requirements
RUN cd backend && pip install --no-cache-dir -r requirements.txt

# Railway dynamically sets the $PORT environment variable
ENV PORT=8000

# Start Uvicorn
CMD cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT

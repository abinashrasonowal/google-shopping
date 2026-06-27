# Apify Node.js base image.
FROM apify/actor-node:20

# Install ONLY the runtime dependencies, from the build-generated dist/package.json
# (which contains no `workspace:` specs — npm rejects those).
COPY dist/package.json ./package.json
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional \
 && echo "Installed NPM packages:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node.js version:" \
 && node --version

# Copy the self-contained bundle (src/ + @gs/shared inlined by esbuild).
COPY dist ./dist

CMD ["node", "dist/main.js"]

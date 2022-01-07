FROM node:14 AS builder
WORKDIR /build
COPY . .
RUN yarn build
COPY ./yarn.lock ./dist/
RUN cd dist && yarn install --production

FROM gcr.io/distroless/nodejs:14
COPY --from=builder /build/dist /app
WORKDIR /app
CMD ["src/main.js"]

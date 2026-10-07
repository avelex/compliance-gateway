# eventscale pinned to the commit spike T2 tested (design-compliance-backend D4).
FROM golang:1.24-alpine AS build
RUN apk add --no-cache git
RUN git clone https://github.com/eventscale/eventscale /src && git -C /src checkout 748a8ef11e66322d0999a89da6d77bedb2118aac
WORKDIR /src
RUN go build -o /eventscale ./cmd

FROM alpine:3.20
COPY --from=build /eventscale /bin/eventscale
ENTRYPOINT ["/bin/eventscale"]

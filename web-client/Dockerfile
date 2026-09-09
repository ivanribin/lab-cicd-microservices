FROM nginxinc/nginx-unprivileged:1.31.5-alpine

USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

EXPOSE 8080

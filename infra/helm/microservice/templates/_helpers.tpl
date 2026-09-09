{{- define "microservice.name" -}}
{{- default .Chart.Name .Values.nameOverride -}}
{{- end -}}

{{- define "microservice.previewColor" -}}
{{- if eq .Values.activeColor "blue" -}}green{{- else -}}blue{{- end -}}
{{- end -}}

{{/*
Rejects empty and "latest" tags at render time, so a release that would make the
running version ambiguous never reaches the cluster. This is the chart-side half
of the "no latest tags" policy; the CI side greps the manifests.
*/}}
{{- define "microservice.imageTag" -}}
{{- if not . -}}
{{- fail "image tag is required: pass colors.<colour>.tag explicitly" -}}
{{- end -}}
{{- if eq . "latest" -}}
{{- fail "the 'latest' tag is forbidden: deploy an immutable tag such as sha-<commit>" -}}
{{- end -}}
{{- . -}}
{{- end -}}

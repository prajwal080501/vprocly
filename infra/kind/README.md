# Local Kubernetes (kind) + Argo CD

Runs the vProcly Helm chart in a local cluster, deployed by Argo CD from `main`. Backing services come from
`infra/compose` via `host.docker.internal`, like managed services in SaaS.

```sh
pnpm stack:up
kind create cluster --config infra/kind/cluster.yaml

# Ingress (ingress-nginx is retired; any Ingress controller works)
helm repo add traefik https://traefik.github.io/charts
helm upgrade --install traefik traefik/traefik -n traefik --create-namespace \
  --set ports.web.hostPort=80 --set service.type=ClusterIP --set-string 'nodeSelector.ingress-ready=true' \
  --set providers.kubernetesIngress.enabled=true --set ingressClass.name=traefik --wait

# Images (use ${app} so zsh does not treat ":l" as a modifier)
for app in api worker; do docker build -f infra/docker/node-service.Dockerfile --build-arg APP=$app -t "vprocly/${app}:local" .; done
docker build -f apps/web/Dockerfile -t vprocly/web:local .
docker build -t vprocly/excel:local services/excel
kind load docker-image --name vprocly vprocly/api:local vprocly/worker:local vprocly/web:local vprocly/excel:local

# App secret (never committed)
kubectl create namespace vprocly
kubectl -n vprocly create secret generic vprocly-secrets \
  --from-literal=DATABASE_URL=postgres://vprocly_app:vprocly_app@host.docker.internal:55432/vprocly \
  --from-literal=DATABASE_ADMIN_URL=postgres://vprocly_admin:vprocly_admin@host.docker.internal:55432/vprocly \
  --from-literal=S3_ACCESS_KEY=vprocly --from-literal=S3_SECRET_KEY=vprocly-secret \
  --from-literal=NEXTAUTH_SECRET=$(openssl rand -hex 32) --from-literal=OIDC_CLIENT_SECRET=vprocly-web-secret

# Argo CD, with a read-only deploy key for this private repo
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.3/manifests/install.yaml
ssh-keygen -t ed25519 -N "" -f /tmp/argocd_deploy_key
gh repo deploy-key add /tmp/argocd_deploy_key.pub --title "argocd-local-kind (read-only)"
kubectl -n argocd create secret generic repo-vprocly --from-literal=type=git \
  --from-literal=url=git@github.com:prajwal080501/vprocly.git --from-file=sshPrivateKey=/tmp/argocd_deploy_key
kubectl -n argocd label secret repo-vprocly argocd.argoproj.io/secret-type=repository
kubectl apply -f infra/argocd/vprocly-local-kind.yaml

# kind has no cloud load balancer, so an Ingress never gets .status.loadBalancer.ingress and Argo CD's
# default health check leaves it (and the Application) stuck on "Progressing" forever. Override it: an
# Ingress with at least one rule is healthy here.
kubectl -n argocd patch configmap argocd-cm --type merge -p '{"data":{"resource.customizations.health.networking.k8s.io_Ingress":"hs = {}\nif obj.spec.rules ~= nil and table.getn(obj.spec.rules) > 0 then\n  hs.status = \"Healthy\"\n  hs.message = \"Ingress has rules (kind has no LoadBalancer to assign an address)\"\n  return hs\nend\nhs.status = \"Progressing\"\nhs.message = \"Waiting for ingress rules\"\nreturn hs\n"}}'
kubectl -n argocd rollout restart statefulset/argocd-application-controller
```

App: http://localhost:58090. Argo CD UI: `kubectl -n argocd port-forward svc/argocd-server 58443:443`, then
https://localhost:58443 (user `admin`, password from
`kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`).

Presigned S3 URLs point at `host.docker.internal:58333`, which a browser on the host may not resolve. The web
UI does not upload files yet; a public S3 endpoint setting comes with the import UI in Sprint 1.

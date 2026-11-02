# refine-keycloak: refine-branded Keycloak login theme.
# make dev   start local Keycloak with the theme mounted live
# make seed  create the demo user (demo / demo, must set up OTP)
# make check-idp  prove the company buttons lead where the stock theme sends them
# make jar   build build/refine-keycloak-<version>.jar
# make hex   rebuild the committed hexagon bundle from src/hex (needs Node)

KC_PORT           ?= 8080
KC_ADMIN          ?= admin
KC_ADMIN_PASSWORD ?= admin
REALM             := refine
URL               := http://localhost:$(KC_PORT)

# v1.2.3 -> 1.2.3. No tag yet -> 0.0.0-dev.
VERSION ?= $(or $(patsubst v%,%,$(shell git describe --tags 2>/dev/null)),0.0.0-dev)
JAR     := build/refine-keycloak-$(VERSION).jar

THREE_VERSION   := 0.185.1
ESBUILD_VERSION := 0.28.2
HEX_DEPS        := build/hex-deps
HEX_BUNDLE      := themes/refine/login/resources/js/hex.js

COMPOSE := docker compose
KCADM   := $(COMPOSE) exec -T keycloak /opt/keycloak/bin/kcadm.sh

export KC_PORT KC_ADMIN KC_ADMIN_PASSWORD

.PHONY: dev seed check-idp logs down jar hex clean

dev:
	$(COMPOSE) up -d
	@printf 'Waiting for Keycloak'
	@for i in $$(seq 1 90); do \
	  curl -fs -o /dev/null $(URL)/realms/$(REALM) && break; \
	  printf '.'; sleep 2; \
	done; echo
	@curl -fs -o /dev/null $(URL)/realms/$(REALM) || { echo "Keycloak did not come up. Run: make logs"; exit 1; }
	@echo "Login page:  $(URL)/realms/$(REALM)/account"
	@echo "Admin:       $(URL)/admin  ($(KC_ADMIN) / local only)"
	@echo "Broker:      $(URL)/realms/broker/account  (local stand-in for BuM SSO)"
	@echo "Edit themes/refine/login/** and reload the browser."

seed:
	@$(KCADM) config credentials --server http://localhost:8080 --realm master \
	  --user '$(KC_ADMIN)' --password '$(KC_ADMIN_PASSWORD)' >/dev/null
	@if $(KCADM) get users -r $(REALM) -q username=demo -q exact=true --fields id | grep -q '"id"'; then \
	  echo "User demo already exists in realm $(REALM)."; \
	else \
	  $(KCADM) create users -r $(REALM) -s username=demo -s enabled=true \
	    -s email=demo@example.com -s emailVerified=true -s firstName=Demo -s lastName=User \
	    -s 'requiredActions=["CONFIGURE_TOTP"]' && \
	  $(KCADM) set-password -r $(REALM) --username demo --new-password demo && \
	  echo "Created demo / demo. First login asks for OTP setup."; \
	fi
	@if $(KCADM) get users -r bum -q username=bum -q exact=true --fields id | grep -q '"id"'; then \
	  echo "User bum already exists in realm bum."; \
	else \
	  $(KCADM) create users -r bum -s username=bum -s enabled=true \
	    -s email=bum@example.com -s emailVerified=true -s firstName=Bum -s lastName=User && \
	  $(KCADM) set-password -r bum --username bum --new-password bum && \
	  echo "Created bum / bum in realm bum, for the broker's first button."; \
	fi

# dev/realm-broker.json sends the browser to the company logins at the hard-coded
# localhost:8080, so the broker and this check need the default KC_PORT.
IDP_THEMES := keycloak.v2 refine refine-broker
check-idp:
	@rm -rf build/check-idp && mkdir -p build/check-idp
	@$(KCADM) config credentials --server http://localhost:8080 --realm master \
	  --user '$(KC_ADMIN)' --password '$(KC_ADMIN_PASSWORD)' >/dev/null
	@orig=$$($(KCADM) get realms/broker --fields loginTheme --format csv --noquotes); \
	trap '$(KCADM) update realms/broker -s loginTheme='"$$orig"'; exit 130' INT TERM; \
	status=0; \
	for t in $(IDP_THEMES); do \
	  $(KCADM) update realms/broker -s loginTheme=$$t && \
	  python3 -I dev/check-idp.py render $$t build/check-idp/$$t.json || status=1; \
	done; \
	$(KCADM) update realms/broker -s loginTheme=$$orig; \
	[ $$status = 0 ] || { echo "❌ a render failed, so no comparison"; exit 1; }; \
	python3 -I dev/check-idp.py compare $(addprefix build/check-idp/,$(addsuffix .json,$(IDP_THEMES)))

logs:
	$(COMPOSE) logs -f keycloak

down:
	$(COMPOSE) down

jar:
	rm -rf build/jar
	mkdir -p build/jar/theme
	cp -R META-INF build/jar/
	cp LICENSE NOTICE build/jar/META-INF/
	cp -R themes/refine themes/refine-broker build/jar/theme/
	rm -f $(JAR)
	cd build/jar && zip -qrX ../$(notdir $(JAR)) META-INF theme -x '*.DS_Store'
	@echo $(JAR)

hex:
	npm install --prefix $(HEX_DEPS) --no-save --no-package-lock --silent three@$(THREE_VERSION)
	NODE_PATH=$(HEX_DEPS)/node_modules npx --yes esbuild@$(ESBUILD_VERSION) src/hex/entry.js \
	  --bundle --format=iife --minify --target=es2020 --legal-comments=eof \
	  --outfile=$(HEX_BUNDLE)

clean:
	rm -rf build

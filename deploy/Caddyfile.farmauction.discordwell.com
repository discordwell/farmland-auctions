farmauction.discordwell.com {
	encode zstd gzip

	header {
		X-Content-Type-Options "nosniff"
		X-Frame-Options "SAMEORIGIN"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	@api path /api /api/*
	handle @api {
		reverse_proxy localhost:3510
	}

	@nextStatic path /_next/static/*
	header @nextStatic Cache-Control "public, max-age=31536000, immutable"

	@siteAssets path /images/* /favicon.svg
	header @siteAssets Cache-Control "public, max-age=86400, stale-while-revalidate=604800"

	@html path / /index.html /health /health/
	header @html Cache-Control "no-cache, no-store, must-revalidate"

	handle {
		root * /opt/farmauction/site
		try_files {path} {path}/ /index.html
		file_server
	}
}

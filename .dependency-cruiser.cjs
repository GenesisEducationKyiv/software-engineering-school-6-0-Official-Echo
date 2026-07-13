module.exports = {
	forbidden: [
		{
			name: "no-circular",
			comment: "No import cycles anywhere in the two services.",
			severity: "error",
			from: {},
			to: { circular: true },
		},

		{
			name: "only-composition-root-touches-persistence",
			comment:
				"src/db and src/repositories are wired together exclusively in " +
				"src/server.js (the composition root). Routes, gRPC handlers, " +
				"services and the saga must receive a repository instance as a " +
				"dependency, never import it directly.",
			severity: "error",
			from: {
				path: "^src/(services|routes|grpc|saga|middleware)/",
			},
			to: {
				path: "^src/(db|repositories)/",
			},
		},

		{
			name: "services-are-transport-agnostic",
			comment:
				"src/services (subscriptionService, queryService, notificationService, " +
				"notifier) implement business logic and must stay usable from both " +
				"HTTP and gRPC. They may not import a specific transport framework.",
			severity: "error",
			from: {
				path: "^src/services/",
			},
			to: {
				path: "^(express|@grpc/grpc-js|@grpc/proto-loader)$",
				dependencyTypes: ["npm", "npm-no-pkg", "npm-unknown"],
			},
		},

		{
			name: "domain-layer-is-pure",
			comment:
				"Validation schemas and the domain error taxonomy " +
				"(src/errors/index.js, src/errors/constants/**) describe business " +
				"rules and must not depend on services, repositories, db, kafka, " +
				"routes or gRPC. (src/errors/httpHandler.js and grpcHandler.js are " +
				"protocol adapters, not domain code, and are intentionally excluded.)",
			severity: "error",
			from: {
				path: "^src/(validation/|errors/(index\\.js|constants/))",
			},
			to: {
				path: "^src/(services|repositories|db|kafka|routes|grpc)/",
			},
		},

		{
			name: "infrastructure-does-not-import-application-or-presentation",
			comment:
				"src/db and src/repositories are the innermost layer: they may not " +
				"depend back on services, routes, gRPC handlers or the saga.",
			severity: "error",
			from: {
				path: "^src/(db|repositories)/",
			},
			to: {
				path: "^src/(services|routes|grpc|saga)/",
			},
		},

		{
			name: "no-service-to-service-source-imports",
			comment:
				"ghchk (src/) and ghchk-scanner-service (scanner-service/src/) are " +
				"two independently deployed processes (see docker-compose.yml: " +
				"'ghchk' and 'scanner' containers). They may only integrate over " +
				"the network — gRPC (packages/proto) and Kafka (packages/common) — " +
				"never by importing each other's source files directly.",
			severity: "error",
			from: { path: "^scanner-service/src/" },
			to: { path: "^src/" },
		},
		{
			name: "no-service-to-service-source-imports-reverse",
			comment: "See no-service-to-service-source-imports.",
			severity: "error",
			from: { path: "^src/" },
			to: { path: "^scanner-service/src/" },
		},

		{
			name: "shared-kernel-does-not-depend-on-services",
			comment:
				"packages/common is the shared kernel (logger, cache, kafka client, " +
				"github client, errors, metrics helpers) consumed by both services. " +
				"It must have zero knowledge of either service's application code.",
			severity: "error",
			from: { path: "^packages/common/" },
			to: { path: "^(src|scanner-service/src)/" },
		},
	],

	options: {
		doNotFollow: {
			path: "node_modules",
		},
		exclude: {
			path: "^(coverage|coverage-unit|coverage-integration|dist|generated|node_modules)",
		},
		tsPreCompilationDeps: true,
		combinedDependencies: true,
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "node", "default"],
			mainFields: ["module", "main"],
		},
	},
};

/**
 * Import required dependencies:
 * - @effect/platform: Core HTTP API building blocks
 * - effect: Core Effect types and utilities
 * - @effect/platform-node: Node.js specific implementations
 */
import {
	FetchHttpClient,
	HttpApi,
	HttpApiBuilder,
	HttpApiClient,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	HttpApiSwagger,
	Multipart
} from '@effect/platform'
import {
	Effect,
	Layer,
	DateTime
} from 'effect'
import { Schema } from 'effect/index'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { createServer } from 'node:http'

const User = Schema.Struct({
	name: Schema.NonEmptyTrimmedString,
	id: Schema.Number,
	createdAt: Schema.DateTimeUtc
})

/**
 * Define the API structure with two endpoints in the "Greetings" group:
 * 1. "hello-world" - GET / - Returns a string
 * 2. "hi-mum" - GET /hi-mum - Returns a string
 */
const optionTwoParam = HttpApiSchema.param("id", Schema.NumberFromString)


/* Creating a Group with an Opaque Type */
class Greetings extends HttpApiGroup.make('Greetings')
	.add(
		HttpApiEndpoint
			.get("hello-world", '/')
			// Specify the headers schema
			.setHeaders(
				Schema.Struct({
					// Header must be a string
					"X-API-Key": Schema.String,
					// Header must be a string with an added description
					"X-Request-ID": Schema.String.annotations({
						description: "Unique identifier for the request"
					})
				})
			)
			.addSuccess(Schema.String)
	)
	.add(
		HttpApiEndpoint.get("users", '/users')
			/* Specify URL params Schema http://localhost:3001/users?page=1&sort="asc"*/
			.setUrlParams(
				Schema.Struct({
					// param "page" for pagination
					page: Schema.NumberFromString,
					// "sort" for sorting options
					sort: Schema.UndefinedOr(Schema.String.annotations({
						description: 'Sorting criteria'
					})),
					/* a URL parameter that accepts multiple values http://localhost:3000/?friend=tom&friend=jensen*/
					friend: Schema.UndefinedOr(Schema.Array(Schema.String))
				})
			)
			.addSuccess(
				Schema.Array(User),
				{
					status: 206 // Add a custom success status
				}
			)
	)
	.add(
		/* add route params */
		HttpApiEndpoint.get('pass-param-option-one', '/param/optionOne/:id')
			/* Define param Schema  */
			.setPath(Schema.Struct({
				id: Schema.NumberFromString
			})).addSuccess(Schema.String)

	)
	.add(
		HttpApiEndpoint.get('pass-param-option-two', `/params/optionTwo/${optionTwoParam}`).addSuccess(Schema.String)
	)
	/* Define a post endpoint */
	.add(
		HttpApiEndpoint.post('post', '/post')
			/* Define request body schema */
			.setPayload(
				Schema.Struct({
					name: Schema.String
				})
					/* Changing the Request Encoding */
					.pipe(HttpApiSchema.withEncoding({ kind: 'UrlParams' }))
			)
			/* Define response schema */
			.addSuccess(Schema.String)
	)
	/* Delete endpoint */
	.add(
		HttpApiEndpoint.del('delete', '/delete/:id')
			.setPath(Schema.Struct({
				id: Schema.NumberFromString
			}))
			/* Set the success response as a string with CSV encoding */
			.addSuccess(Schema.String.pipe(
				HttpApiSchema.withEncoding({
					/* Specify the type of the response */
					kind: 'Text',
					/* Define the content type as text/csv */
					contentType: 'text/csv'

				})
			))
	)
	/* Patch/Update endpoint */
	.add(
		HttpApiEndpoint.patch('patch/update', '/patch/:id')
			.setPath(Schema.Struct({
				id: Schema.NumberFromString
			}))
	)
	.add(
		HttpApiEndpoint.get('catchAll', '/*').addSuccess(Schema.String)
	)
	// file upload. multipart request
	.add(
		HttpApiEndpoint.post(
			"upload",
			'/upload'
		)
			.setPayload(
				/* Specify that the payload is a multipart request */
				HttpApiSchema.Multipart(
					Schema.Struct({
						/* Define a "files" field to handle file uploads */
						files: Multipart.FilesSchema
					})
				)
			)
			.addSuccess(Schema.String)
	)
{ }

const MyApi = HttpApi.make("MyApi")
	.add(Greetings)


/**
 * Implement the "Greetings" group endpoints:
 * - Creates a live implementation of the API group using HttpApiBuilder
 * - Each endpoint returns a simple string response wrapped in an Effect
 * - The handler function maps each endpoint to its implementation
 */
const now = await Effect.runPromise(DateTime.now)
console.log('now --->', now)
const GreetingsLive = HttpApiBuilder
	.group(
		MyApi,
		"Greetings",
		(handler) => handler
			.handle(
				"hello-world",
				() => Effect.succeed('Hello World')
			)
			.handle(
				"users",
				() => Effect.succeed([{ name: 'James', id: 123, createdAt: now }])
			)
			.handle(
				"pass-param-option-one",
				() => Effect.succeed('Passing params Option one')
			)
			.handle(
				"pass-param-option-two",
				() => Effect.succeed('Passing params Option two')
			)
			.handle(
				"post",
				() => Effect.succeed('Post')
			)
			.handle(
				"delete",
				() => Effect.succeed('Del')
			)
			.handle(
				"patch/update",
				() => Effect.succeed('Patch')
			)
			.handle(
				"catchAll",
				() => Effect.succeed("Catch All")
			)
			.handle(
				"upload",
				() => Effect.succeed('Uploaded')
			)
	)

/**
 * Create a live implementation of the entire API:
 * - Combines the API definition with its implementation using Layer
 */
const MyApiLive = HttpApiBuilder.api(MyApi).pipe(Layer.provide(GreetingsLive))

/**
 * Set up and configure the HTTP server:
 * - Creates a server layer using HttpApiBuilder.serve()
 * - Provides the live API implementation
 * - Configures Node.js HTTP server to listen on port 3001
 */
const ServerLive = HttpApiBuilder.serve().pipe(
	Layer.provide(HttpApiSwagger.layer()), // Provide the Swagger layer so clients can access auto-generated docs
	Layer.provide(MyApiLive), // Provide the live API implementation
	Layer.provide(NodeHttpServer.layer(createServer, {
		port: 3001
	}))
)

/**
 * Launch the server:
 * - Uses Layer.launch to start the server
 * - Runs the server in the Node.js runtime environment
 */
Layer.launch(ServerLive).pipe(NodeRuntime.runMain)


/* 
 * Program that derives and uses a client from the API
 * */
const program = Effect.gen(function* () {
	// Derive a client
	const client = yield* HttpApiClient.make(MyApi, {
		baseUrl: "http://localhost:3001"
	})

	/* Call the "hi-mum" endpoint */
	const hiMum = yield* client.Greetings["hello-world"]()
	yield* Effect.log(hiMum)
})


/* Provide a fetch-based HTTP client and run the program */
Effect.runFork(program.pipe(Effect.provide(FetchHttpClient.layer)))

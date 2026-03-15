import express from "express";
import cors from "cors";
import passport from "./middlewares/passport";
import mongoSanitize from "express-mongo-sanitize";
import swaggerUi from "swagger-ui-express";
import swaggerDoc from "./definitions/swagger.json";
import mainRoutes from "./routes/index";
import errorHandler from "./middlewares/errorHandler";
import dotenv from "dotenv";

dotenv.config();

process.env.rootDir = __dirname;

const app = express();

app.use(express.json());
app.use(cors());
app.use(passport.initialize());
app.use(mongoSanitize());
app.use(express.urlencoded({ extended: false }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
app.use("/", mainRoutes);
app.use(errorHandler);

export default app;
import Axios from 'axios';
import { Observable, Subject } from 'rxjs';
import { scan, startWith, switchMap } from 'rxjs/operators';
import { parse } from 'node-html-parser';

const IP = "172.30.9.120";
const ROURL = `http://${IP}/DCIM/Movie/RO`;

// Simulate a stream of HTML chunks
const chunkStream = new Subject<string>();

// Function to parse tokens from accumulated HTML
function parseTokens(html: string): any[] {
  const root = parse(html);

  // Extract the data you need from the HTML using node-html-parser
  const data: any = {};

  // For example, you can extract the title tag:
  const tableElement = root.querySelector('#body > table:nth-child(1) > tbody:nth-child(1)');
  data.title = tableElement ? tableElement.text : '';

  return data;
}

// Observable to accumulate and parse HTML into JSON objects
const htmlStream = chunkStream.pipe(
  scan((acc: string, chunk: string) => {
    const accumulatedHTML = acc + chunk;
    const parsedData: any = parseTokens(accumulatedHTML);

    // Return the remaining data that couldn't be parsed as a JSON object
    return parsedData;
  }, {}),
  startWith({}), // Initialize accumulator with an empty object
  switchMap((parsedData: any) => {
    if (Object.keys(parsedData).length === 0) {
      return [];
    } else {
      return [parsedData];
    }
  })
);

// Subscribe to the HTML stream to receive JSON objects
htmlStream.subscribe((jsonObject: any) => {
  // Handle each emitted JSON object
  console.log('Received JSON object:', jsonObject);
});

// Simulate receiving HTML chunks from a stream (e.g., network or file stream)
async function fetchHTMLChunks() {
  try {
    const response = await Axios.get(ROURL, { responseType: 'stream' });

    response.data.on('data', (chunk: Buffer) => {
      // Convert the chunk to a string
      const chunkString: string = chunk.toString();

      // Push the HTML chunk to the chunkStream
      chunkStream.next(chunkString);
    });

    response.data.on('end', () => {
      // Complete the chunkStream when HTML loading is finished
      chunkStream.complete();
    });

    response.data.on('error', (error: Error) => {
      // Handle errors
      console.error('Error fetching HTML:', error);
    });
  } catch (error) {
    // Handle errors
    console.error('Error fetching HTML:', error);
  }
}

// Start fetching HTML chunks
fetchHTMLChunks();

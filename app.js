const express = require('express')
const cors = require('cors');
const mssql = require('mssql');

const app = express()
const port = require('process')

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const config = {
    user: 'IsahIsah',
    password: 'isahisah',
    server: 'LR-SQL01\\MSSQLSERVER_ISAH',
    database: 'Test_LegendFleet',
    options: {
        trustServerCertificate: true,
        port: 1433,
    }
  };

app.get('/', async (req, res) => {
    let { suaPropriedade } = req.query;
    if (!suaPropriedade) {
      return res.status(400).send('A propriedade é obrigatória na requisição.');
    }

    let result = await GetDelLines(suaPropriedade).catch(error => { res.status(500).send('Erro no servidor'); })

    if (result.length === 0 ) res.status(404).send('Could not find SO');
    else res.json(workData(result));        
  
})

app.post('/dellines', async (req, res) => {
  let delLines = VerifyV1(req.body.delLines);
  let oldDelLines = await GetDelLines(req.body.ordNr)
  oldDelLines.forEach(line => {
    line.PartCode = line.PartCode.trim()
  })
  // console.log(oldDelLines)
  assemblyDelLinesWithScan(delLines, oldDelLines)

  res.send('Rotinas SQL executadas com sucesso!');
});

async function GetDelLines(ordNr) {
  let query = `
    DECLARE @OrdNr T_Nr_Ord = '${ordNr}'
    SELECT OrdNr, PartCode, DL.Qty, Dl.Tobedelqty, DL.DossierCode, DL.DetailCode, DL.DetailSubCode
    FROM SV_LEG_IncompleteShipmentLines ISL
        INNER JOIN T_DeliveryLine DL ON ISL.DossierCode = DL.DossierCode AND ISL.DetailSubCode = DL.DetailSubCode AND ISL.DetailCode = DL.DetailCode
    WHERE	OrdType <> 20 AND 
            OrdType <> 25 AND
            OrdType <> 15 AND
            OrdNr = @OrdNr
    `;
    try {
        const pool = await mssql.connect(config);
        let result = await pool.request().query(query);
        return result.recordset

      } catch (error) {
        return error
      }
}

function assemblyDelLinesWithScan(delLines, oldDelLines) {
  let importDelLines = [];
  indexToBeDel = [];
  oldDelLines.forEach( (oldLine, index) => {
    let equivalentIndex = delLines.findIndex(line => line.PartCode === oldLine.PartCode);
    let equivalentLine = delLines[equivalentIndex]
    
    if ( oldLine.Qty === parseInt(equivalentLine.Qty) ) {
      oldLine.Tobedelqty = parseInt(equivalentLine.Qty)
      oldLine.certificate = equivalentLine.certificate
      oldLine.lotNr = equivalentLine.lotNr
      importDelLines.push(oldLine)
      indexToBeDel.push(index)
      delLines.splice(equivalentIndex, 1)
    } else {
      // let totalQty = oldLine.Qty
      // oldLine.Qty = parseInt(equivalentLine.Qty)
      // oldLine.Tobedelqty = parseInt(equivalentLine.Qty)
      // oldLine.certificate = equivalentLine.certificate
      // oldLine.lotNr = equivalentLine.lotNr
      // importDelLines.push(oldLine)
      // let sumQty = equivalentLine.Qty
      
      // do {
      //   let newEquivalentIndex
      //   delLines.forEach( (line, index) => {
      //     if (line.Qty + sumQty === totalQty || line.Qty + sumQty < totalQty ) newEquivalentIndex = index
      //   })
      //   let newEquivalentLine = delLines[newEquivalentIndex]
      //   sumQty = sumQty + newEquivalentLine.Qty
      //   oldLine.Tobedelqty = newEquivalentLine.Qty
      //   oldLine.certificate = newEquivalentLine.certificate
      //   oldLine.lotNr = newEquivalentLine.lotNr
      //   importDelLines.push(oldLine)
      //   delLines.splice(newEquivalentIndex, 1)
      // } while (sumQty === totalQty)
    }
  })
  oldDelLines = oldDelLines.filter((line, index) => !indexToBeDel.includes(index) )
  
  indexToBeDel = []

  oldDelLines.forEach( (oldLine, index) => {
    let totalQty = oldLine.Qty
    let sumQty = 0

    do {
      let delLineIndex = delLines.findIndex(line => line.PartCode === oldLine.PartCode)
      console.log(delLines[delLineIndex], oldLine)
      // console.log(sumQty, totalQty, delLines.length)
      let importDelLine = JSON.parse(JSON.stringify(oldLine))
      sumQty += parseInt(delLines[delLineIndex].Qty)
      importDelLine.Qty = parseInt(delLines[delLineIndex].Qty)
      importDelLine.Tobedelqty = parseInt(delLines[delLineIndex].Qty)
      importDelLine.certificate = delLines[delLineIndex].certificate
      importDelLine.lotNr = delLines[delLineIndex].lotNr
      delLines.splice(delLineIndex, 1)
      importDelLines.push(importDelLine)
    } while (sumQty < totalQty || delLines.length > 0)
    indexToBeDel.push(index)

  })
  oldDelLines = oldDelLines.filter((line, index) => !indexToBeDel.includes(index) )
  console.log(importDelLines)
  console.log(delLines)
  console.log(oldDelLines)
  
}

function VerifyV1(delLines) {
  let newDelLines = []
  delLines.forEach(line => {
    if ( !line.lotNr.startsWith("LF?]") ) {
      line.certificate = line.lotNr;
      line.lotNr = "N''";
      if ( line.certificate === '' ) line.certificate = "N''"
    } else {
      line.certificate = "N''"
    }
    newDelLines.push(line)
  })
  return newDelLines
}

function mergeObjects(obj1, obj2) {
  return { ...obj1, ...obj2 };
}

function workData(result) {
  let workedData = {
    ordNr: result[0].OrdNr,
    parts: []
  }
  let groupedByPartCode = {};

  result.forEach(item => {
      let { PartCode, Qty } = item;

      const trimmedPartCode = PartCode.trim()

      // Se o PartCode ainda não existe no objeto, inicializa com a quantidade atual
      if (!groupedByPartCode[trimmedPartCode]) {
          groupedByPartCode[trimmedPartCode] = Qty;
      } else {
          // Se o PartCode já existe, adiciona a quantidade atual
          groupedByPartCode[trimmedPartCode] += Qty;
      }
  });

  // Converte o objeto de volta para um array de objetos
  workedData.parts = Object.keys(groupedByPartCode).map(PartCode => ({
      PartCode,
      Qty: groupedByPartCode[PartCode],
      ScanQty: 0
  }));
  return workedData
}


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
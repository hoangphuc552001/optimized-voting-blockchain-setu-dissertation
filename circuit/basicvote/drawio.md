<mxfile host="app.diagrams.net" modified="2026-03-05T00:00:00.000Z" agent="Claude" version="21.0.0">
  <diagram name="Sample Merkle Tree" id="merkle">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1200" pageHeight="800" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Title -->
        <mxCell id="mt_title" value="Sample Merkle Tree Structure" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=20;fontStyle=1" vertex="1" parent="1">
          <mxGeometry x="400" y="20" width="400" height="40" as="geometry" />
        </mxCell>

        <!-- Description -->
        <mxCell id="mt_desc" value="Merkle tree used in this voting system to prove voter registration without revealing identity" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontStyle=0" vertex="1" parent="1">
          <mxGeometry x="250" y="60" width="700" height="30" as="geometry" />
        </mxCell>

        <!-- Root Node -->
        <mxCell id="root" value="ROOT&#xa;Hash(A+B+C+D)&#xa;0x1234...abcd" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="520" y="150" width="140" height="60" as="geometry" />
        </mxCell>

        <!-- Level 1 Nodes -->
        <mxCell id="l1_left" value="Hash(A+B)&#xa;0xabcd...1234" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="300" y="280" width="120" height="50" as="geometry" />
        </mxCell>

        <mxCell id="l1_right" value="Hash(C+D)&#xa;0xefgh...5678" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="740" y="280" width="120" height="50" as="geometry" />
        </mxCell>

        <!-- Level 2 Nodes (Leaves) -->
        <mxCell id="leaf_A" value="Leaf A&#xa;Poseidon(secret1)&#xa;Voter 1" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="120" y="430" width="100" height="60" as="geometry" />
        </mxCell>

        <mxCell id="leaf_B" value="Leaf B&#xa;Poseidon(secret2)&#xa;Voter 2" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="280" y="430" width="100" height="60" as="geometry" />
        </mxCell>

        <mxCell id="leaf_C" value="Leaf C&#xa;Poseidon(secret3)&#xa;Voter 3" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="560" y="430" width="100" height="60" as="geometry" />
        </mxCell>

        <mxCell id="leaf_D" value="Leaf D&#xa;Poseidon(secret4)&#xa;Voter 4" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="720" y="430" width="100" height="60" as="geometry" />
        </mxCell>

        <!-- Edges connecting tree -->
        <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="l1_left" target="root">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="l1_right" target="root">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge3" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="leaf_A" target="l1_left">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge4" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="leaf_B" target="l1_left">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge5" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="leaf_C" target="l1_right">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge6" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666" edge="1" parent="1" source="leaf_D" target="l1_right">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Merkle Proof Example Box -->
        <mxCell id="proof_box" value="Merkle Proof Example: Voter 2" style="text;html=1;strokeColor=#82b366;fillColor=#d5e8d4;align=left;verticalAlign=top;whiteSpace=wrap;rounded=1;fontStyle=1;fontSize=14" vertex="1" parent="1">
          <mxGeometry x="40" y="540" width="300" height="30" as="geometry" />
        </mxCell>

        <!-- Proof Elements -->
        <mxCell id="proof_leaf" value="1. Own Leaf: Poseidon(secret2)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="60" y="585" width="180" height="35" as="geometry" />
        </mxCell>

        <mxCell id="proof_sibling" value="2. Sibling Hash: Hash(Leaf A)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="60" y="630" width="180" height="35" as="geometry" />
        </mxCell>

        <mxCell id="proof_parent" value="3. Parent Hash: Hash(A+B)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="60" y="675" width="180" height="35" as="geometry" />
        </mxCell>

        <mxCell id="proof_aunt" value="4. Aunt Hash: Hash(C+D)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="60" y="720" width="180" height="35" as="geometry" />
        </mxCell>

        <!-- Verification Box -->
        <mxCell id="verify_box" value="Verification" style="text;html=1;strokeColor=#82b366;fillColor=#d5e8d4;align=left;verticalAlign=top;whiteSpace=wrap;rounded=1;fontStyle=1;fontSize=14" vertex="1" parent="1">
          <mxGeometry x="400" y="540" width="300" height="30" as="geometry" />
        </mxCell>

        <mxCell id="verify_step1" value="Hash(Leaf A, Leaf B) → Hash(A+B)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="420" y="585" width="180" height="30" as="geometry" />
        </mxCell>

        <mxCell id="verify_step2" value="Hash(Hash(A+B), Hash(C+D)) → ROOT" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="420" y="625" width="180" height="30" as="geometry" />
        </mxCell>

        <mxCell id="verify_step3" value="ROOT matches contract root? ✓" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;fontStyle=1" vertex="1" parent="1">
          <mxGeometry x="420" y="665" width="180" height="30" as="geometry" />
        </mxCell>

        <!-- Key Properties Box -->
        <mxCell id="props_box" value="Merkle Tree Properties" style="text;html=1;strokeColor=#666666;fillColor=#f5f5f5;align=left;verticalAlign=top;whiteSpace=wrap;rounded=1;fontStyle=1;fontSize=14" vertex="1" parent="1">
          <mxGeometry x="750" y="540" width="380" height="30" as="geometry" />
        </mxCell>

        <mxCell id="prop1" value="• Efficient Verification: Only O(log n) data needed to verify membership" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="575" width="360" height="25" as="geometry" />
        </mxCell>

        <mxCell id="prop2" value="• Membership Proof: Prove a leaf exists without revealing other leaves" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="600" width="360" height="25" as="geometry" />
        </mxCell>

        <mxCell id="prop3" value="• Collision Resistant: Hash function ensures tree integrity" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="625" width="360" height="25" as="geometry" />
        </mxCell>

        <mxCell id="prop4" value="• Scalable: Add voters without recomputing entire tree" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="650" width="360" height="25" as="geometry" />
        </mxCell>

        <mxCell id="prop5" value="• Commitment: Root hash stored on blockchain as voter registry commitment" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="675" width="360" height="25" as="geometry" />
        </mxCell>

        <mxCell id="prop6" value="• Privacy: Individual secrets never revealed to admin or blockchain" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11" vertex="1" parent="1">
          <mxGeometry x="760" y="700" width="360" height="25" as="geometry" />
        </mxCell>

        <!-- Hash Function Box -->
        <mxCell id="hash_box" value="Hash Function: Poseidon" style="text;html=1;strokeColor=#9673a6;fillColor=#e1d5e7;align=left;verticalAlign=top;whiteSpace=wrap;rounded=1;fontStyle=1;fontSize=12" vertex="1" parent="1">
          <mxGeometry x="920" y="130" width="180" height="25" as="geometry" />
        </mxCell>

        <mxCell id="hash_desc" value="• ZK-friendly hash&#xa;• Arithmetized via polynomials&#xa;• Efficient for ZK circuits" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=10" vertex="1" parent="1">
          <mxGeometry x="930" y="155" width="160" height="50" as="geometry" />
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>